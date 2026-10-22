from __future__ import annotations

import uuid

from django.db import models

from apps.finance.money import MoneyField
from apps.tenancy.models import Branch, OrgScopedModel


class Account(OrgScopedModel):
    """Chart of accounts (a small fixed set; see services/ledger.py)."""

    class Kind(models.TextChoices):
        ASSET = "asset", "Asset"
        LIABILITY = "liability", "Liability"
        INCOME = "income", "Income"
        EXPENSE = "expense", "Expense"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=10)
    name_ar = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80)
    kind = models.CharField(max_length=10, choices=Kind.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="account_code_per_org")
        ]
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class JournalEntry(OrgScopedModel):
    """A balanced posting. Immutable; corrections are reversing entries."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    date = models.DateField()
    document_type = models.CharField(max_length=30)
    document_id = models.UUIDField()
    memo = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["document_type", "document_id"])]

    def __str__(self) -> str:
        return f"{self.document_type}:{self.document_id}"


class JournalLine(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="+")
    debit = MoneyField(default=0)
    credit = MoneyField(default=0)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(debit__gte=0) & models.Q(credit__gte=0))
                & (models.Q(debit=0) | models.Q(credit=0)),
                name="journal_line_one_side",
            )
        ]

    def __str__(self) -> str:
        return f"{self.account_id} {self.debit}/{self.credit}"


class Customer(OrgScopedModel):
    """A credit customer (clinics, regulars). `balance` is the receivable, kept with the ledger."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=40)
    name_ar = models.CharField(max_length=200)
    name_en = models.CharField(max_length=200)
    phone = models.CharField(max_length=40, blank=True)
    credit_limit = MoneyField(default=0)
    balance = MoneyField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="customer_code_per_org")
        ]
        ordering = ["name_en"]

    def __str__(self) -> str:
        return self.name_en


class PartyLedgerEntry(OrgScopedModel):
    """Customer receivable / supplier payable movements. Positive = they owe more."""

    class Party(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        SUPPLIER = "supplier", "Supplier"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    party_type = models.CharField(max_length=10, choices=Party.choices)
    party_id = models.UUIDField()
    amount = MoneyField()
    balance_after = MoneyField()
    document_type = models.CharField(max_length=30)
    document_id = models.UUIDField()
    memo = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["party_type", "party_id", "created_at"])]

    def __str__(self) -> str:
        return f"{self.party_type}:{self.party_id} {self.amount}"
