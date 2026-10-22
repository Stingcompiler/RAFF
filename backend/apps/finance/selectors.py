# Read-side queries for this app. All reads go through OrgScopedQuerySet.
from __future__ import annotations

import uuid
from typing import Any

from django.db.models import Max

from apps.finance.models import Customer, PartyLedgerEntry, PartyPayment
from apps.finance.services.ledger import supplier_balance


def last_activity(party_type: str, ids: list[uuid.UUID]) -> dict[uuid.UUID, Any]:
    rows = (
        PartyLedgerEntry.objects.filter(party_type=party_type, party_id__in=ids)
        .values("party_id")
        .annotate(last=Max("created_at"))
    )
    return {r["party_id"]: r["last"] for r in rows}


def customers() -> list[dict[str, Any]]:
    rows = list(Customer.objects.filter(is_active=True))
    last = last_activity(PartyLedgerEntry.Party.CUSTOMER, [c.pk for c in rows])
    return [
        {
            "id": c.pk,
            "code": c.code,
            "name_ar": c.name_ar,
            "name_en": c.name_en,
            "phone": c.phone,
            "balance": c.balance,
            "credit_limit": c.credit_limit,
            "last_activity": last.get(c.pk),
        }
        for c in rows
    ]


def suppliers() -> list[dict[str, Any]]:
    from apps.purchasing.models import Supplier

    rows = list(Supplier.objects.all().order_by("name_en"))
    last = last_activity(PartyLedgerEntry.Party.SUPPLIER, [s.pk for s in rows])
    return [
        {
            "id": s.pk,
            "code": s.code,
            "name_ar": s.name_ar,
            "name_en": s.name_en,
            "phone": s.phone,
            "balance": supplier_balance(s.pk),
            "credit_limit": None,
            "last_activity": last.get(s.pk),
        }
        for s in rows
    ]


def _numbers(entries: list[PartyLedgerEntry]) -> dict[uuid.UUID, str]:
    """Document numbers for the ledger's description column."""
    from apps.purchasing.models import GoodsReceipt
    from apps.returns.models import SaleReturn
    from apps.sales.models import Sale

    ids: dict[str, list[uuid.UUID]] = {}
    for e in entries:
        ids.setdefault(e.document_type, []).append(e.document_id)
    out: dict[uuid.UUID, str] = {}
    for model, kind in (
        (Sale, "sale"),
        (SaleReturn, "return"),
        (GoodsReceipt, "receipt"),
        (PartyPayment, "party_payment"),
    ):
        for pk, number in model.objects.filter(pk__in=ids.get(kind, [])).values_list(
            "pk", "number"
        ):
            out[pk] = number
    return out


def ledger(party_type: str, party_id: uuid.UUID, limit: int = 100) -> list[dict[str, Any]]:
    entries = list(
        PartyLedgerEntry.objects.filter(party_type=party_type, party_id=party_id).order_by(
            "-created_at"
        )[:limit]
    )
    numbers = _numbers(entries)
    return [
        {
            "id": e.pk,
            "date": e.created_at,
            "document_type": e.document_type,
            "document_number": numbers.get(e.document_id, ""),
            "debit": e.amount if e.amount > 0 else None,
            "credit": -e.amount if e.amount < 0 else None,
            "balance": e.balance_after,
        }
        for e in entries
    ]
