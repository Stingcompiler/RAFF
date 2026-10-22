# Read-side queries for this app. All reads go through OrgScopedQuerySet.
from __future__ import annotations

import datetime as dt
import uuid
from collections import defaultdict
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.conf import settings
from django.db.models import Sum

from apps.catalog.models import Item
from apps.finance.money import money
from apps.inventory.models import Batch, Location, StockBalance, StockMovement, Stocktake
from apps.tenancy import clock
from apps.tenancy.models import Branch


@dataclass(frozen=True)
class ItemStock:
    sellable_base: int
    held_base: int
    nearest_expiry: dt.date | None
    cost_per_base: Decimal | None
    cost_per_sale_unit: Decimal | None
    margin_pct: Decimal | None
    status: str  # good | near_expiry | low | out | expired


def batch_status(expiry: dt.date | None, today: dt.date, location_kind: str) -> str:
    if location_kind == Location.Kind.QUARANTINE:
        return "quarantined"
    if location_kind == Location.Kind.REVIEW:
        return "held"
    if expiry is None:
        return "held"
    if expiry < today:
        return "expired"
    if expiry <= today + dt.timedelta(days=settings.RAFF_NEAR_EXPIRY_DAYS):
        return "near_expiry"
    return "good"


def stock_for_items(branch: Branch, items: list[Item]) -> dict[uuid.UUID, ItemStock]:
    """Stock summary per item for one branch (one query for balances)."""
    today = clock.today()
    near = today + dt.timedelta(days=settings.RAFF_NEAR_EXPIRY_DAYS)
    ids = [i.pk for i in items]
    rows = (
        StockBalance.objects.filter(branch=branch, item_id__in=ids, quantity_base__gt=0)
        .select_related("batch", "location")
        .order_by("batch__expiry_date")
    )
    sellable: dict[uuid.UUID, int] = defaultdict(int)
    held: dict[uuid.UUID, int] = defaultdict(int)
    expiry: dict[uuid.UUID, dt.date] = {}
    expired: set[uuid.UUID] = set()
    for b in rows:
        if b.location.kind != Location.Kind.SELLABLE:
            held[b.item_id] += b.quantity_base
            continue
        if b.batch.expiry_date and b.batch.expiry_date < today:
            expired.add(b.item_id)
            continue
        sellable[b.item_id] += b.quantity_base
        if b.batch.expiry_date and b.item_id not in expiry:
            expiry[b.item_id] = b.batch.expiry_date
    costs: dict[uuid.UUID, Decimal] = {}
    for batch in Batch.objects.filter(item_id__in=ids).order_by("item_id", "-created_at"):
        costs.setdefault(batch.item_id, batch.unit_cost)
    result = {}
    for item in items:
        qty = sellable[item.pk]
        if qty == 0:
            status = "expired" if item.pk in expired else "out"
        elif item.pk in expiry and expiry[item.pk] <= near:
            status = "near_expiry"
        elif qty < item.reorder_level_base:
            status = "low"
        else:
            status = "good"
        cost = costs.get(item.pk)
        sale = next((u for u in item.units.all() if u.is_default_sale), None)
        sale_cost = money(cost * sale.factor) if cost is not None and sale else None
        price = getattr(item, "price", None)
        margin = (
            ((price - sale_cost) / price * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
            if sale_cost is not None and price
            else None
        )
        result[item.pk] = ItemStock(
            qty, held[item.pk], expiry.get(item.pk), cost, sale_cost, margin, status
        )
    return result


def batches_for_item(branch: Branch, item: Item) -> list[dict[str, object]]:
    today = clock.today()
    rows = (
        StockBalance.objects.filter(branch=branch, item=item, quantity_base__gt=0)
        .select_related("batch", "location")
        .order_by("batch__expiry_date", "batch__batch_no")
    )
    return [
        {
            "batch_id": str(b.batch_id),
            "batch_no": b.batch.batch_no,
            "expiry_date": b.batch.expiry_date,
            "quantity_base": b.quantity_base,
            "location": b.location.kind,
            "unit_cost": b.batch.unit_cost,
            "status": batch_status(b.batch.expiry_date, today, b.location.kind),
        }
        for b in rows
    ]


def movements_for_item(branch: Branch, item: Item, limit: int = 100) -> list[StockMovement]:
    return list(
        StockMovement.objects.filter(branch=branch, item=item)
        .select_related("batch", "location")
        .order_by("-created_at")[:limit]
    )


def on_hand_by_movements(branch: Branch, item: Item) -> int:
    """Sum of the movement log (the source of truth) — used to audit balances."""
    total = StockMovement.objects.filter(branch=branch, item=item).aggregate(
        q=Sum("quantity_base")
    )["q"]
    return int(total or 0)


def stocktake_rows(take: Stocktake, *, with_lines: bool) -> dict[str, Any]:
    """A stocktake with its counted lines in each item's default sale unit."""
    from apps.inventory.services.stocktake import needs_reason

    lines = list(take.lines.select_related("item").prefetch_related("item__units"))
    out: dict[str, Any] = {
        "id": take.pk,
        "number": take.number,
        "scope": take.scope,
        "category_name_ar": take.category.name_ar if take.category else None,
        "category_name_en": take.category.name_en if take.category else None,
        "status": take.status,
        "snapshot_at": take.snapshot_at,
        "approved_at": take.approved_at,
        "impact": take.impact,
        "counted": sum(1 for line in lines if line.counted_base is not None),
        "total": len(lines),
    }
    if with_lines:
        rows = []
        for line in lines:
            units = list(line.item.units.all())
            unit = next((u for u in units if u.is_default_sale), None) or next(
                (u for u in units if u.is_base), None
            )
            variance = None if line.counted_base is None else line.counted_base - line.system_base
            rows.append(
                {
                    "id": line.pk,
                    "item_id": line.item_id,
                    "code": line.item.code,
                    "name_ar": line.item.name_ar,
                    "name_en": line.item.name_en,
                    "strength": line.item.strength,
                    "unit_ar": unit.name_ar if unit else "",
                    "unit_en": unit.name_en if unit else "",
                    "factor": unit.factor if unit else 1,
                    "system_base": line.system_base,
                    "counted_base": line.counted_base,
                    "variance_base": variance,
                    "applied_base": line.applied_base,
                    "reason": line.reason,
                    "reason_required": needs_reason(line),
                    "value": None if variance is None else money(variance * line.unit_cost),
                }
            )
        out["lines"] = rows
    return out
