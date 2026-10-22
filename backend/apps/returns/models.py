from __future__ import annotations

import uuid

from django.db import models

from apps.finance.money import MoneyField
from apps.inventory.models import Batch
from apps.sales.models import Sale, SaleLine, Shift
from apps.tenancy.models import Branch, OrgScopedModel


class SaleReturn(OrgScopedModel):
    """A posted customer return against one sale. Returned stock always goes to quarantine."""

    class Refund(models.TextChoices):
        CASH = "cash", "Cash from the drawer"
        ACCOUNT = "account", "Credit to the customer's account"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="returns")
    shift = models.ForeignKey(
        Shift, null=True, blank=True, on_delete=models.PROTECT, related_name="refunds"
    )
    refund_method = models.CharField(max_length=10, choices=Refund.choices)
    total = MoneyField()
    cost_total = MoneyField()
    idempotency_key = models.CharField(max_length=100)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    posted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-posted_at"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "number"], name="return_number"),
            models.CheckConstraint(condition=models.Q(total__gte=0), name="return_total_positive"),
        ]

    def __str__(self) -> str:
        return self.number


class SaleReturnLine(OrgScopedModel):
    class Reason(models.TextChoices):
        DAMAGED = "damaged", "Damaged pack"
        WRONG_ITEM = "wrong_item", "Wrong item"
        EXPIRED = "expired", "Expired"
        NOT_NEEDED = "not_needed", "No longer needed"
        OTHER = "other", "Other"

    class Condition(models.TextChoices):
        SEALED = "sealed", "Sealed"
        OPENED = "opened", "Opened"
        DAMAGED = "damaged", "Damaged"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale_return = models.ForeignKey(SaleReturn, on_delete=models.CASCADE, related_name="lines")
    sale_line = models.ForeignKey(SaleLine, on_delete=models.PROTECT, related_name="returns")
    quantity = models.PositiveIntegerField()
    base_quantity = models.PositiveIntegerField()
    amount = MoneyField()
    cost = MoneyField()
    reason = models.CharField(max_length=12, choices=Reason.choices)
    condition = models.CharField(max_length=8, choices=Condition.choices)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="return_qty_positive")
        ]

    def __str__(self) -> str:
        return f"{self.sale_return_id}:{self.sale_line_id} x {self.quantity}"


class SaleReturnAllocation(OrgScopedModel):
    """Which sold batches came back (at the cost they left with)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    line = models.ForeignKey(SaleReturnLine, on_delete=models.CASCADE, related_name="allocations")
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name="+")
    base_quantity = models.PositiveIntegerField()
    unit_cost = MoneyField()

    def __str__(self) -> str:
        return f"{self.line_id}:{self.batch_id}={self.base_quantity}"
