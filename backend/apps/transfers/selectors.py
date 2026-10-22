# Read-side queries for this app. All reads go through OrgScopedQuerySet.
from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.finance.money import money
from apps.tenancy.models import Branch
from apps.transfers.models import Transfer


def _branch(b: Branch) -> dict[str, Any]:
    return {"id": b.pk, "code": b.code, "name_ar": b.name_ar, "name_en": b.name_en}


def transfer_row(t: Transfer, *, with_lines: bool) -> dict[str, Any]:
    lines = list(t.lines.select_related("item", "batch").prefetch_related("item__units"))
    out: dict[str, Any] = {
        "id": t.pk,
        "number": t.number,
        "from_branch": _branch(t.from_branch),
        "to_branch": _branch(t.to_branch),
        "status": t.status,
        "note": t.note,
        "created_at": t.created_at,
        "sent_at": t.sent_at,
        "received_at": t.received_at,
        "lines_count": len(lines),
        "value": money(sum((li.unit_cost * li.quantity_base for li in lines), Decimal(0))),
    }
    if with_lines:
        rows = []
        for li in lines:
            units = list(li.item.units.all())
            unit = next((u for u in units if u.is_default_sale), None) or next(
                (u for u in units if u.is_base), None
            )
            rows.append(
                {
                    "id": li.pk,
                    "item_id": li.item_id,
                    "code": li.item.code,
                    "name_ar": li.item.name_ar,
                    "name_en": li.item.name_en,
                    "strength": li.item.strength,
                    "batch_id": li.batch_id,
                    "batch_no": li.batch.batch_no,
                    "expiry_date": li.batch.expiry_date,
                    "quantity_base": li.quantity_base,
                    "received_base": li.received_base,
                    "unit_ar": unit.name_ar if unit else "",
                    "unit_en": unit.name_en if unit else "",
                    "factor": unit.factor if unit else 1,
                }
            )
        out["lines"] = rows
    return out
