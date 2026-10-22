"""Quarantine: returned and recalled stock waits here for a pharmacist's decision."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.finance.money import money
from apps.finance.services.ledger import charge_supplier, post_journal
from apps.inventory.models import Batch, Location, QuarantineEntry, StockBalance, StockMovement
from apps.inventory.services.stock import Move, apply_movements, location
from apps.sync.services.idempotency import run_once
from apps.tenancy import clock
from apps.tenancy.models import Branch

DECISIONS = {
    "restock": QuarantineEntry.Status.RESTOCKED,
    "destroy": QuarantineEntry.Status.DESTROYED,
    "return": QuarantineEntry.Status.RETURNED,
}


class QuarantineError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def hold(
    branch: Branch,
    batch: Batch,
    quantity_base: int,
    unit_cost: Decimal,
    *,
    source: str,
    source_id: uuid.UUID | None,
    reason: str,
    user: User,
) -> QuarantineEntry:
    """Record an entry for stock the caller has already moved into quarantine."""
    entry: QuarantineEntry = QuarantineEntry.objects.create(
        branch=branch,
        item_id=batch.item_id,
        batch=batch,
        quantity_base=quantity_base,
        unit_cost=unit_cost,
        source=source,
        source_id=source_id,
        reason=reason,
        created_by=user,
    )
    return entry


def supplier_for(batch: Batch) -> uuid.UUID | None:
    """The supplier of the latest posted receipt that brought in this batch."""
    from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine

    line = (
        GoodsReceiptLine.objects.filter(
            item_id=batch.item_id,
            batch_no=batch.batch_no,
            receipt__status=GoodsReceipt.Status.POSTED,
        )
        .select_related("receipt")
        .order_by("-receipt__posted_at")
        .first()
    )
    return line.receipt.supplier_id if line else None


def _decide(entry: QuarantineEntry, decision: str, note: str, user: User) -> dict[str, Any]:
    if entry.status != QuarantineEntry.Status.PENDING:
        raise QuarantineError("already_decided")
    branch = entry.branch
    batch = entry.batch
    held = location(branch, Location.Kind.QUARANTINE)
    moves = [Move(held, batch, -entry.quantity_base, batch.unit_cost)]
    cost = money(entry.unit_cost * entry.quantity_base)
    supplier_id = None
    if decision == "restock":
        if batch.expiry_date is None or batch.expiry_date < clock.today():
            raise QuarantineError("batch_expired")
        moves.append(
            Move(
                location(branch, Location.Kind.SELLABLE),
                batch,
                entry.quantity_base,
                batch.unit_cost,
            )
        )
    elif decision == "return":
        supplier_id = supplier_for(batch)
        if supplier_id is None:
            raise QuarantineError("no_supplier")
    apply_movements(
        branch,
        moves,
        kind=StockMovement.Kind.QUARANTINE,
        document_type="quarantine",
        document_id=entry.pk,
        user=user,
    )
    if decision == "destroy" and cost:
        post_journal(
            branch=branch,
            date=clock.today(),
            document_type="quarantine",
            document_id=entry.pk,
            lines=[("5100", cost, Decimal(0)), ("1200", Decimal(0), cost)],
            memo="destroyed",
        )
    if decision == "return" and supplier_id is not None:
        if cost:
            post_journal(
                branch=branch,
                date=clock.today(),
                document_type="quarantine",
                document_id=entry.pk,
                lines=[("2000", cost, Decimal(0)), ("1200", Decimal(0), cost)],
                memo="returned to supplier",
            )
        charge_supplier(supplier_id, -cost, document_type="quarantine", document_id=entry.pk)
    entry.status = DECISIONS[decision]
    entry.decided_by = user
    entry.decided_at = timezone.now()
    entry.decision_note = note
    entry.save(update_fields=["status", "decided_by", "decided_at", "decision_note"])
    record(
        f"quarantine_{decision}",
        "quarantine",
        entry.pk,
        actor=user,
        branch=branch,
        quantity=entry.quantity_base,
        cost=str(cost),
        note=note,
    )
    return {"id": str(entry.pk), "status": entry.status}


@transaction.atomic
def decide(
    entry_id: uuid.UUID, decision: str, note: str, *, idempotency_key: str | None, user: User
) -> dict[str, Any]:
    """Restock, destroy or return to supplier. Lock order: the entry (the document) first."""
    if decision not in DECISIONS:
        raise QuarantineError("invalid_decision")
    entry = (
        QuarantineEntry.objects.select_for_update()
        .select_related("branch", "batch")
        .get(pk=entry_id)
    )
    return run_once(
        "quarantine_decide",
        idempotency_key,
        {"entry": str(entry_id), "decision": decision, "note": note},
        lambda: _decide(entry, decision, note, user),
    )


@transaction.atomic
def recall(
    branch: Branch, batch_id: uuid.UUID, reason: str, *, idempotency_key: str | None, user: User
) -> dict[str, Any]:
    """Hold a whole batch: everything on the shelf or under review moves to quarantine."""
    batch = Batch.objects.select_for_update().get(pk=batch_id)

    def action() -> dict[str, Any]:
        sources = [location(branch, Location.Kind.SELLABLE), location(branch, Location.Kind.REVIEW)]
        held = location(branch, Location.Kind.QUARANTINE)
        balances = {
            b.location_id: b.quantity_base
            for b in StockBalance.objects.select_for_update()
            .filter(batch=batch, location__in=sources)
            .order_by("branch_id", "item_id", "batch_id", "location_id")
        }
        total = sum(balances.values())
        if total <= 0:
            raise QuarantineError("nothing_to_recall")
        document_id = uuid.uuid4()
        moves = [
            Move(loc, batch, -balances[loc.pk], batch.unit_cost)
            for loc in sources
            if balances.get(loc.pk)
        ]
        moves.append(Move(held, batch, total, batch.unit_cost))
        apply_movements(
            branch,
            moves,
            kind=StockMovement.Kind.QUARANTINE,
            document_type="recall",
            document_id=document_id,
            user=user,
        )
        entry = hold(
            branch,
            batch,
            total,
            batch.unit_cost,
            source=QuarantineEntry.Source.RECALL,
            source_id=document_id,
            reason=reason,
            user=user,
        )
        record(
            "recall", "batch", batch.pk, actor=user, branch=branch, quantity=total, reason=reason
        )
        return {"id": str(entry.pk), "quantity_base": total}

    return run_once(
        "recall",
        idempotency_key,
        {"batch": str(batch_id), "branch": str(branch.pk), "reason": reason},
        action,
    )
