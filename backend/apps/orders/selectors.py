# Read-side queries for this app. All reads go through OrgScopedQuerySet.
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from apps.orders.models import Order


def reserved_base(
    branch_id: uuid.UUID | None,
    item_ids: list[uuid.UUID],
    *,
    exclude_order: uuid.UUID | None = None,
) -> dict[uuid.UUID, int]:
    """Base units held for confirmed orders, per item."""
    from django.db.models import Sum

    from apps.orders.models import StockReservation

    if branch_id is None:
        return {}
    rows = (
        StockReservation.objects.filter(
            branch_id=branch_id, item_id__in=item_ids, status=StockReservation.Status.ACTIVE
        )
        .exclude(order_id=exclude_order)
        .values("item_id")
        .annotate(q=Sum("quantity_base"))
    )
    return {r["item_id"]: r["q"] or 0 for r in rows}


def public_order(order: Order) -> dict[str, Any]:
    """What the customer sees: no staff names, no internal notes, no stock numbers."""
    from apps.storefront.services.listings import storefront_settings

    lines = order.lines.select_related("item", "unit")
    return {
        "number": order.number,
        "status": order.status,
        "created_at": order.created_at,
        "estimated_total": order.estimated_total,
        "lines": [
            {
                "name_ar": li.item.name_ar,
                "name_en": li.item.name_en,
                "strength": li.item.strength,
                "unit_ar": li.unit.name_ar,
                "unit_en": li.unit.name_en,
                "quantity": li.quantity,
                "price": li.published_price,
                "rx": li.rx,
            }
            for li in lines
        ],
        "events": [{"status": e.status, "at": e.created_at} for e in order.events.all()],
        "whatsapp": storefront_settings().whatsapp,
    }


def staff_order(order: Order) -> dict[str, Any]:
    from apps.catalog.selectors import current_price
    from apps.catalog.services.items import ensure_default_price_lists
    from apps.orders.services.workflow import allowed
    from apps.sales.selectors import pos_items
    from apps.storefront.services.listings import storefront_settings

    retail = ensure_default_price_lists()
    lines = list(order.lines.select_related("item", "unit"))
    stock = {
        r["id"]: r["sellable_base"]
        for r in pos_items(order.branch, "", ids=[str(li.item_id) for li in lines])
    }
    # What this order can still get: the shelf less what other orders hold.
    held = reserved_base(order.branch_id, [li.item_id for li in lines], exclude_order=order.pk)
    from apps.orders.models import OrderInvoiceLink

    link = OrderInvoiceLink.objects.filter(order=order).select_related("sale").first()
    return {
        "id": order.pk,
        "number": order.number,
        "token": order.token,
        "status": order.status,
        "created_at": order.created_at,
        "customer_name": order.customer_name,
        "phone": order.phone,
        "note": order.note,
        "reason": order.reason,
        "internal_note": order.internal_note,
        "estimated_total": order.estimated_total,
        "allowed": allowed(order),
        "lines": [
            {
                "id": li.pk,
                "item_id": li.item_id,
                "code": li.item.code,
                "name_ar": li.item.name_ar,
                "name_en": li.item.name_en,
                "strength": li.item.strength,
                "unit_ar": li.unit.name_ar,
                "unit_en": li.unit.name_en,
                "factor": li.unit.factor,
                "quantity": li.quantity,
                "rx": li.rx,
                "published_price": li.published_price,
                "current_price": (p.price if (p := current_price(li.unit, retail)) else None),
                "available_units": max(0, stock.get(li.item_id, 0) - held.get(li.item_id, 0))
                // (li.unit.factor or 1),
            }
            for li in lines
        ],
        "events": [
            {
                "status": e.status,
                "at": e.created_at,
                "actor_ar": e.actor.display_name_ar if e.actor else None,
                "actor_en": e.actor.display_name_en if e.actor else None,
                "note": e.note,
            }
            for e in order.events.select_related("actor")
        ],
        "sale_number": link.sale.number if link else None,
        "whatsapp": storefront_settings().whatsapp,
    }
