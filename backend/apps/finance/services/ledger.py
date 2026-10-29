"""Balanced journal entries and party (customer/supplier) balances."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal

from apps.finance.models import Account, Customer, JournalEntry, JournalLine, PartyLedgerEntry
from apps.finance.money import money
from apps.tenancy.models import Branch

# Fixed chart of accounts for 1.0.
ACCOUNTS = [
    ("1000", "الصندوق", "Cash on hand", Account.Kind.ASSET),
    ("1010", "البنك", "Bank", Account.Kind.ASSET),
    ("1020", "تحويلات بانتظار التحقق", "Transfers awaiting verification", Account.Kind.ASSET),
    ("1100", "ذمم العملاء", "Customer receivables", Account.Kind.ASSET),
    ("1200", "المخزون", "Inventory", Account.Kind.ASSET),
    ("2000", "ذمم الموردين", "Supplier payables", Account.Kind.LIABILITY),
    ("4000", "المبيعات", "Sales", Account.Kind.INCOME),
    ("4100", "إيرادات بونص الموردين", "Supplier bonus income", Account.Kind.INCOME),
    ("5000", "تكلفة المبيعات", "Cost of goods sold", Account.Kind.EXPENSE),
    ("5100", "فروق المخزون", "Inventory variances", Account.Kind.EXPENSE),
    ("5200", "عجز وزيادة الصندوق", "Cash over/short", Account.Kind.EXPENSE),
]


class Unbalanced(Exception):
    pass


def ensure_accounts() -> dict[str, Account]:
    out = {}
    for code, ar, en, kind in ACCOUNTS:
        out[code], _ = Account.objects.get_or_create(
            code=code, defaults={"name_ar": ar, "name_en": en, "kind": kind}
        )
    return out


def post_journal(
    *,
    branch: Branch,
    date: dt.date,
    document_type: str,
    document_id: uuid.UUID,
    lines: list[tuple[str, Decimal, Decimal]],
    memo: str = "",
) -> JournalEntry:
    """Post (account code, debit, credit) lines; refuses unless debits equal credits."""
    lines = [(c, money(d), money(cr)) for c, d, cr in lines if d or cr]
    if sum(d for _, d, _ in lines) != sum(c for _, _, c in lines) or not lines:
        raise Unbalanced(document_type)
    accounts = ensure_accounts()
    entry: JournalEntry = JournalEntry.objects.create(
        branch=branch, date=date, document_type=document_type, document_id=document_id, memo=memo
    )
    JournalLine.objects.bulk_create(
        [
            JournalLine(
                entry=entry,
                account=accounts[code],
                debit=d,
                credit=c,
                organization_id=entry.organization_id,
            )
            for code, d, c in lines
        ]
    )
    return entry


class CreditLimitExceeded(Exception):
    def __init__(self, available: Decimal) -> None:
        super().__init__(str(available))
        self.available = available


def charge_customer(
    customer: Customer,
    amount: Decimal,
    *,
    document_type: str,
    document_id: uuid.UUID,
    enforce_limit: bool = True,
) -> PartyLedgerEntry:
    """Add to a customer's receivable, locking the customer row (LOCKING.md step 5)."""
    customer = Customer.objects.select_for_update().get(pk=customer.pk)
    new_balance = money(customer.balance + amount)
    if enforce_limit and amount > 0 and new_balance > customer.credit_limit:
        raise CreditLimitExceeded(money(customer.credit_limit - customer.balance))
    customer.balance = new_balance
    customer.save(update_fields=["balance"])
    entry: PartyLedgerEntry = PartyLedgerEntry.objects.create(
        party_type=PartyLedgerEntry.Party.CUSTOMER,
        party_id=customer.pk,
        amount=money(amount),
        balance_after=new_balance,
        document_type=document_type,
        document_id=document_id,
    )
    return entry


def supplier_balance(supplier_id: uuid.UUID) -> Decimal:
    last = (
        PartyLedgerEntry.objects.filter(
            party_type=PartyLedgerEntry.Party.SUPPLIER, party_id=supplier_id
        )
        .order_by("-created_at")
        .first()
    )
    return last.balance_after if last else Decimal(0)


def supplier_balances(supplier_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    """Every supplier's balance in one query (latest ledger row per supplier; review B-08)."""
    rows = (
        PartyLedgerEntry.objects.filter(
            party_type=PartyLedgerEntry.Party.SUPPLIER, party_id__in=supplier_ids
        )
        .order_by("party_id", "-created_at")
        .distinct("party_id")
        .values_list("party_id", "balance_after")
    )
    return dict(rows)


def charge_supplier(
    supplier_id: uuid.UUID, amount: Decimal, *, document_type: str, document_id: uuid.UUID
) -> PartyLedgerEntry:
    """Add to what we owe a supplier (payable)."""
    from apps.purchasing.models import Supplier

    Supplier.objects.select_for_update().get(pk=supplier_id)  # serialises the running balance
    balance = money(supplier_balance(supplier_id) + amount)
    entry: PartyLedgerEntry = PartyLedgerEntry.objects.create(
        party_type=PartyLedgerEntry.Party.SUPPLIER,
        party_id=supplier_id,
        amount=money(amount),
        balance_after=balance,
        document_type=document_type,
        document_id=document_id,
    )
    return entry
