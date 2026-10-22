"""Receipt content: always in the branch's receipt locale (CLAUDE.md rule 15)."""

from __future__ import annotations

from typing import Any

from django.utils import timezone

from apps.finance.money import money
from apps.sales.models import Sale

LABELS = {
    "ar": {
        "total": "الإجمالي",
        "cash": "نقدي",
        "bank": "بنكي",
        "credit": "آجل",
        "change": "الباقي",
        "footer": "شكراً لزيارتكم",
        "invoice": "فاتورة",
    },
    "en": {
        "total": "Total",
        "cash": "Cash",
        "bank": "Bank",
        "credit": "Credit",
        "change": "Change",
        "footer": "Thank you",
        "invoice": "Invoice",
    },
}


def fmt(value: Any) -> str:
    v = money(value)
    return f"{v:,.0f}" if v == v.to_integral() else f"{v:,.2f}"


def receipt(sale: Sale) -> dict[str, Any]:
    locale = sale.branch.receipt_locale
    lab = LABELS[locale]
    ar = locale == "ar"

    def cur(value: Any) -> str:
        return f"{fmt(value)} ج.س" if ar else f"SDG {fmt(value)}"

    issued = timezone.localtime(sale.posted_at).strftime("%Y-%m-%d %H:%M")
    lines = [
        {
            "name": f"{line.item.name_ar if ar else line.item.name_en} × {line.quantity}",
            "total": fmt(line.line_total),
        }
        for line in sale.lines.select_related("item")
    ]
    payments = []
    change = money(0)
    for p in sale.payments.all():
        payments.append(
            {
                "label": lab[p.method],
                "amount": cur(p.tendered if p.method == "cash" and p.tendered else p.amount),
            }
        )
        change += p.change or 0
    if change:
        payments.append({"label": lab["change"], "amount": cur(change)})
    org_name = sale.branch.organization.name
    return {
        "locale": locale,
        "shop": org_name,
        "branch": " · ".join(
            [
                sale.branch.name_ar if ar else sale.branch.name_en,
                sale.device.name_ar if ar else sale.device.name_en,
            ]
        ),
        "number": f"{lab['invoice']} {sale.number}",
        "issuedAt": issued,
        "lines": lines,
        "totalLabel": lab["total"],
        "total": cur(sale.total),
        "payments": payments,
        "footer": lab["footer"],
    }
