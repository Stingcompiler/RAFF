from __future__ import annotations

import uuid

from django.db import models

from apps.catalog.models import Item
from apps.finance.money import MoneyField
from apps.inventory.models import Batch
from apps.tenancy.models import Branch, OrgScopedModel


class Transfer(OrgScopedModel):
    """Stock sent from one branch to another. Sending moves it to 'in transit' at the source;
    receiving puts what arrived on the destination's shelf and writes off any shortfall."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        PARTIAL = "partial", "Partly received"
        CLOSED = "closed", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20, blank=True)
    from_branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    to_branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    note = models.CharField(max_length=200, blank=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    sent_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(from_branch=models.F("to_branch")), name="transfer_two_branches"
            )
        ]

    def __str__(self) -> str:
        return self.number or str(self.pk)


class TransferLine(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transfer = models.ForeignKey(Transfer, on_delete=models.CASCADE, related_name="lines")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="+")
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name="+")
    quantity_base = models.PositiveIntegerField()
    received_base = models.PositiveIntegerField(null=True, blank=True)
    unit_cost = MoneyField(default=0)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_base__gt=0), name="transfer_qty_positive"
            )
        ]

    def __str__(self) -> str:
        return f"{self.transfer_id}:{self.batch_id}"
