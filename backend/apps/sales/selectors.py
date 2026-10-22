# Read-side queries for this app. All reads go through OrgScopedQuerySet.
from __future__ import annotations

from typing import Any

from apps.catalog.models import Item
from apps.catalog.selectors import search_items
from apps.catalog.views import _with_price
from apps.inventory.selectors import stock_for_items
from apps.tenancy.models import Branch


def pos_items(branch: Branch, query: str, limit: int = 50) -> list[dict[str, Any]]:
    """Rows for the POS result list: price, stock in the sale unit, nearest expiry, state."""
    qs = search_items(query, active=True)
    if not query.strip():
        qs = qs.order_by("code")
    items: list[Item] = list(_with_price(qs.prefetch_related("units__barcodes"))[:limit])
    stock = stock_for_items(branch, items)
    rows = []
    for item in items:
        st = stock[item.pk]
        sale = next((u for u in item.units.all() if u.is_default_sale), None)
        rows.append(
            {
                "id": item.pk,
                "code": item.code,
                "name_ar": item.name_ar,
                "name_en": item.name_en,
                "generic_name": item.generic_name,
                "strength": item.strength,
                "dosage_form": item.dosage_form,
                "rx": item.classification == Item.Classification.RX,
                "unit": sale,
                "units": list(item.units.all()),
                "price": getattr(item, "price", None),
                "sellable_base": st.sellable_base,
                "nearest_expiry": st.nearest_expiry,
                "status": st.status,
                "barcodes": [b.code for u in item.units.all() for b in u.barcodes.all()],
            }
        )
    return rows
