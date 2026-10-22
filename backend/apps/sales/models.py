from __future__ import annotations

import uuid

from django.db import models

from apps.catalog.models import Item, ItemUnit
from apps.finance.models import Customer
from apps.finance.money import MoneyField
from apps.inventory.models import Batch
from apps.tenancy.models import Branch, Device, OrgScopedModel


class Shift(OrgScopedModel):
    """A cashier's working period at one counter. Sales need an open shift."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.PositiveIntegerField()
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name="shifts")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    opened_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    opened_at = models.DateTimeField(auto_now_add=True)
    opening_cash = MoneyField()
    closed_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    expected_cash = MoneyField(null=True, blank=True)
    counted_cash = MoneyField(null=True, blank=True)
    variance = MoneyField(null=True, blank=True)

    settled_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    settled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "device"],
                condition=models.Q(status="open"),
                name="one_open_shift_per_counter",
            ),
            models.UniqueConstraint(
                fields=["organization", "branch", "number"], name="shift_number_per_branch"
            ),
            models.CheckConstraint(
                condition=models.Q(opening_cash__gte=0), name="opening_cash_not_negative"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.branch_id}#{self.number}"


class Sale(OrgScopedModel):
    """A posted sale (invoice). Never edited; returns are separate documents."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name="+")
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="sales")
    customer = models.ForeignKey(
        Customer, null=True, blank=True, on_delete=models.PROTECT, related_name="sales"
    )
    subtotal = MoneyField()
    discount_total = MoneyField()
    total = MoneyField()
    cost_total = MoneyField()
    idempotency_key = models.CharField(max_length=100)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    posted_at = models.DateTimeField(auto_now_add=True)
    reprints = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "number"], name="sale_number_unique"),
            models.UniqueConstraint(
                fields=["organization", "idempotency_key"], name="sale_key_unique"
            ),
            models.CheckConstraint(
                condition=models.Q(total__gte=0), name="sale_total_not_negative"
            ),
        ]
        indexes = [models.Index(fields=["branch", "posted_at"])]

    def __str__(self) -> str:
        return self.number


class SaleLine(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField()
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="+")
    unit = models.ForeignKey(ItemUnit, on_delete=models.PROTECT, related_name="+")
    quantity = models.PositiveIntegerField()
    base_quantity = models.PositiveIntegerField()
    unit_price = MoneyField()
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    line_subtotal = MoneyField()
    line_total = MoneyField()
    cost_total = MoneyField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "sale", "line_no"], name="sale_line_no"
            ),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="sale_qty_positive"),
            models.CheckConstraint(
                condition=models.Q(discount_pct__gte=0) & models.Q(discount_pct__lte=100),
                name="sale_discount_range",
            ),
        ]
        ordering = ["line_no"]

    def __str__(self) -> str:
        return f"{self.sale_id}#{self.line_no}"


class SaleAllocation(OrgScopedModel):
    """Which batches a line was taken from (FEFO, or the batch the cashier chose)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    line = models.ForeignKey(SaleLine, on_delete=models.CASCADE, related_name="allocations")
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name="+")
    base_quantity = models.PositiveIntegerField()
    unit_cost = MoneyField()

    def __str__(self) -> str:
        return f"{self.line_id}:{self.batch_id}={self.base_quantity}"


class Payment(OrgScopedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        BANK = "bank", "Bank transfer"
        CREDIT = "credit", "Customer credit"

    class Verification(models.TextChoices):
        NOT_NEEDED = "not_needed", "Not needed"
        PENDING = "pending", "Awaiting verification"
        CONFIRMED = "confirmed", "Confirmed"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="payments")
    method = models.CharField(max_length=10, choices=Method.choices)
    amount = MoneyField()
    tendered = MoneyField(null=True, blank=True)
    change = MoneyField(null=True, blank=True)
    bank_reference = models.CharField(max_length=60, blank=True)
    bank_account = models.CharField(max_length=60, blank=True)
    verification = models.CharField(
        max_length=12, choices=Verification.choices, default=Verification.NOT_NEEDED
    )

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="payment_positive")
        ]

    def __str__(self) -> str:
        return f"{self.method}:{self.amount}"


class HeldSale(OrgScopedModel):
    """A cart put aside (F4) at a counter, resumed later (F6). Not a document."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="+")
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="+")
    created_by = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    cart = models.JSONField()
    total = MoneyField(default=0)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return str(self.pk)
