# Read-side queries for this app. All reads go through OrgScopedQuerySet.
from __future__ import annotations

from typing import Any

from apps.returns.services.posting import default_refund, returned
from apps.sales.models import Sale


def returnable_sale(sale: Sale) -> dict[str, Any]:
    lines = list(sale.lines.select_related("item", "unit"))
    done = returned([line.pk for line in lines])
    return {
        "id": sale.pk,
        "number": sale.number,
        "posted_at": sale.posted_at,
        "total": sale.total,
        "customer_name_ar": sale.customer.name_ar if sale.customer else None,
        "customer_name_en": sale.customer.name_en if sale.customer else None,
        "default_refund": default_refund(sale),
        "lines": [
            {
                "id": line.pk,
                "line_no": line.line_no,
                "item_id": line.item_id,
                "code": line.item.code,
                "name_ar": line.item.name_ar,
                "name_en": line.item.name_en,
                "strength": line.item.strength,
                "unit_ar": line.unit.name_ar,
                "unit_en": line.unit.name_en,
                "quantity": line.quantity,
                "returned": done.get(line.pk, (0, 0))[0],
                "returnable": line.quantity - done.get(line.pk, (0, 0))[0],
                "line_total": line.line_total,
            }
            for line in lines
        ],
    }
