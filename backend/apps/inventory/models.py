from __future__ import annotations

import uuid

from django.db import models

from apps.catalog.models import Item
from apps.finance.money import MoneyField
from apps.tenancy.models import Branch, OrgScopedModel


class Location(OrgScopedModel):
    """Where stock sits inside a branch. Only `sellable` stock can be sold."""

    class Kind(models.TextChoices):
        SELLABLE = "sellable", "Sellable shelf"
        REVIEW = "review", "Held for review"
        QUARANTINE = "quarantine", "Quarantine"
        TRANSIT = "transit", "In transit"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="locations")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    code = models.CharField(max_length=20)
    name_ar = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "branch", "code"], name="location_code_per_branch"
            )
        ]

    def __str__(self) -> str:
        return self.code


class Batch(OrgScopedModel):
    """A supplier batch of one item. `unit_cost` is per base unit (weighted on re-receipt)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="batches")
    batch_no = models.CharField(max_length=40)
    expiry_date = models.DateField(null=True, blank=True)
    unit_cost = MoneyField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "item", "batch_no"], name="batch_no_per_item"
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gte=0), name="batch_cost_not_negative"
            ),
        ]

    def __str__(self) -> str:
        return self.batch_no


class StockBalance(OrgScopedModel):
    """Summary of the movement log per (location, batch); updated in the same transaction."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="balances")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="balances")
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name="balances")
    quantity_base = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "location", "batch"], name="balance_per_location_batch"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_base__gte=0), name="balance_not_negative"
            ),
        ]
        indexes = [models.Index(fields=["branch", "item"])]

    def __str__(self) -> str:
        return f"{self.location_id}:{self.batch_id}={self.quantity_base}"


class StockMovement(OrgScopedModel):
    """The source of truth for stock. Immutable; corrections are new movements."""

    class Kind(models.TextChoices):
        RECEIPT = "receipt", "Goods receipt"
        SALE = "sale", "Sale"
        RETURN = "return", "Customer return"
        RELEASE = "release", "Released from review"
        ADJUSTMENT = "adjustment", "Adjustment"
        TRANSFER_OUT = "transfer_out", "Transfer out"
        TRANSFER_IN = "transfer_in", "Transfer in"
        QUARANTINE = "quarantine", "Quarantine"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="movements")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="movements")
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name="movements")
    quantity_base = models.IntegerField()
    unit_cost = MoneyField()
    kind = models.CharField(max_length=14, choices=Kind.choices)
    document_type = models.CharField(max_length=30)
    document_id = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        "accounts.User", null=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(condition=~models.Q(quantity_base=0), name="movement_not_zero")
        ]
        indexes = [
            models.Index(fields=["branch", "item", "created_at"]),
            models.Index(fields=["document_type", "document_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.quantity_base}"
