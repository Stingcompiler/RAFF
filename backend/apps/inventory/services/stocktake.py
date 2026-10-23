"""Stocktakes: snapshot, count, approve. Approval applies (counted - snapshot) to today's
stock, so sales and receipts made after the snapshot stay intact."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.catalog.models import Category, Item
from apps.finance.money import money
from apps.finance.services.ledger import post_journal
from apps.inventory.models import (
    Batch,
    Location,
    StockBalance,
    StockMovement,
    Stocktake,
    StocktakeLine,
)
from apps.inventory.services.stock import Move, apply_movements, location, lock_balances
from apps.sync.services.idempotency import run_once
from apps.sync.services.sequences import next_number
from apps.tenancy import clock
from apps.tenancy.models import Branch


class StocktakeError(Exception):
    def __init__(self, code: str, **detail: object) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


def _sellable(branch: Branch, item_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[int, Decimal]]:
    """(quantity, weighted cost per base unit) on the sellable shelf, per item."""
    out: dict[uuid.UUID, tuple[int, Decimal]] = {}
    rows = StockBalance.objects.filter(
        branch=branch,
        item_id__in=item_ids,
        location__kind=Location.Kind.SELLABLE,
        quantity_base__gt=0,
    ).select_related("batch")
    totals: dict[uuid.UUID, list[Decimal]] = {}
    for r in rows:
        qty, value = totals.setdefault(r.item_id, [Decimal(0), Decimal(0)])
        totals[r.item_id] = [qty + r.quantity_base, value + r.batch.unit_cost * r.quantity_base]
    for item_id, (qty, value) in totals.items():
        out[item_id] = (int(qty), money(value / qty) if qty else Decimal(0))
    return out


@transaction.atomic
def start(branch: Branch, *, category: Category | None, user: User) -> Stocktake:
    """Number the stocktake and snapshot the shelf for every active item in scope."""
    items = Item.objects.filter(is_active=True)
    if category is not None:
        items = items.filter(category=category)
    item_ids = list(items.values_list("id", flat=True))
    snapshot = _sellable(branch, item_ids)
    take: Stocktake = Stocktake.objects.create(
        number=next_number("stocktake", "ST"),
        branch=branch,
        scope=Stocktake.Scope.CATEGORY if category else Stocktake.Scope.BRANCH,
        category=category,
        created_by=user,
    )
    StocktakeLine.objects.bulk_create(
        [
            StocktakeLine(
                stocktake=take,
                item_id=item_id,
                system_base=snapshot.get(item_id, (0, Decimal(0)))[0],
                unit_cost=snapshot.get(item_id, (0, Decimal(0)))[1],
                organization_id=take.organization_id,
            )
            for item_id in item_ids
        ]
    )
    record("start", "stocktake", take.pk, actor=user, branch=branch, items=len(item_ids))
    return take


def needs_reason(line: StocktakeLine) -> bool:
    if line.counted_base is None:
        return False
    variance = line.counted_base - line.system_base
    if variance == 0:
        return False
    if line.system_base == 0:
        return True
    return abs(variance) * 100 >= settings.RAFF_STOCKTAKE_REASON_PCT * line.system_base


def impact(take: Stocktake) -> Decimal:
    """Value of the counted variances at snapshot cost (negative = shortage)."""
    return money(
        sum(
            (
                (line.counted_base - line.system_base) * line.unit_cost
                for line in take.lines.all()
                if line.counted_base is not None
            ),
            Decimal(0),
        )
    )


@transaction.atomic
def save_counts(take_id: uuid.UUID, counts: list[dict[str, Any]], user: User) -> Stocktake:
    take: Stocktake = Stocktake.objects.select_for_update().get(pk=take_id)
    if take.status != Stocktake.Status.DRAFT:
        raise StocktakeError("stocktake_approved")
    lines = {str(line.pk): line for line in take.lines.select_related("item")}
    changed = []
    for c in counts:
        line = lines.get(str(c["line_id"]))
        if line is None:
            raise StocktakeError("unknown_line")
        line.counted_base = c["counted_base"]
        line.reason = c.get("reason", "")[:200]
        changed.append(line)
    StocktakeLine.objects.bulk_update(changed, ["counted_base", "reason"])
    take.impact = impact(take)
    take.save(update_fields=["impact"])
    return take


def _shelf_batches(branch: Branch, item_id: uuid.UUID) -> list[Batch]:
    return list(
        Batch.objects.filter(item_id=item_id, balances__branch=branch)
        .distinct()
        .order_by("expiry_date", "batch_no")
    )


def _approve(take: Stocktake, user: User) -> dict[str, Any]:
    if take.status != Stocktake.Status.DRAFT:
        raise StocktakeError("stocktake_approved")
    lines = [line for line in take.lines.all() if line.counted_base is not None]
    missing = [
        str(line.item_id) for line in lines if needs_reason(line) and not line.reason.strip()
    ]
    if missing:
        raise StocktakeError("reason_required", items=",".join(missing))
    branch = take.branch
    shelf = location(branch, Location.Kind.SELLABLE)
    variances: dict[uuid.UUID, int] = {}
    for line in lines:
        if line.counted_base is not None and line.counted_base != line.system_base:
            variances[line.item_id] = line.counted_base - line.system_base
    batches = {item_id: _shelf_batches(branch, item_id) for item_id in variances}
    # Lock every shelf balance of the affected items in one ordered statement (LOCKING.md).
    balances = lock_balances(branch, [(shelf, b) for bs in batches.values() for b in bs])
    moves: list[Move] = []
    applied: dict[uuid.UUID, int] = {}
    for item_id, variance in sorted(variances.items(), key=lambda kv: str(kv[0])):
        item_batches = batches[item_id]
        if variance > 0:
            # Found stock joins the latest-expiring unexpired batch on the shelf.
            usable = [
                b for b in item_batches if b.expiry_date is None or b.expiry_date >= clock.today()
            ]
            pool = usable or item_batches
            if not pool:
                raise StocktakeError("no_batch_for_overage", item=item_id)
            moves.append(Move(shelf, pool[-1], variance, pool[-1].unit_cost))
            applied[item_id] = variance
        else:
            need = -variance
            taken = 0
            for b in item_batches:  # FEFO: the nearest expiry goes first
                on_hand = balances[(shelf.pk, b.pk)].quantity_base
                q = min(need - taken, on_hand)
                if q > 0:
                    moves.append(Move(shelf, b, -q, b.unit_cost))
                    taken += q
            # Stock sold since the snapshot cannot be taken twice; the shortfall is capped.
            applied[item_id] = -taken
    if moves:
        apply_movements(
            branch,
            moves,
            kind=StockMovement.Kind.ADJUSTMENT,
            document_type="stocktake",
            document_id=take.pk,
            user=user,
        )
    value = money(sum((m.unit_cost * m.quantity_base for m in moves), Decimal(0)))
    if value:
        post_journal(
            branch=branch,
            date=clock.today(),
            document_type="stocktake",
            document_id=take.pk,
            lines=[("1200", value, Decimal(0)), ("5100", Decimal(0), value)]
            if value > 0
            else [("5100", -value, Decimal(0)), ("1200", Decimal(0), -value)],
        )
    for line in lines:
        line.applied_base = applied.get(line.item_id, 0)
    StocktakeLine.objects.bulk_update(lines, ["applied_base"])
    take.status = Stocktake.Status.APPROVED
    take.approved_by = user
    take.approved_at = timezone.now()
    take.impact = value
    take.save(update_fields=["status", "approved_by", "approved_at", "impact"])
    record("approve", "stocktake", take.pk, actor=user, branch=branch, impact=str(value))
    return {"id": str(take.pk), "impact": str(value), "adjusted_items": len(variances)}


@transaction.atomic
def approve(take_id: uuid.UUID, *, idempotency_key: str | None, user: User) -> dict[str, Any]:
    take = (
        Stocktake.objects.select_for_update(of=("self",)).select_related("branch").get(pk=take_id)
    )
    return run_once(
        "stocktake_approve",
        idempotency_key,
        {"stocktake": str(take_id)},
        lambda: _approve(take, user),
    )


def counted_summary(take: Stocktake) -> dict[str, int]:
    lines = list(take.lines.all())
    return {
        "counted": sum(1 for line in lines if line.counted_base is not None),
        "total": len(lines),
    }
