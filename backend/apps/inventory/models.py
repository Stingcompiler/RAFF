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


class QuarantineEntry(OrgScopedModel):
    """Stock held in the quarantine location until a responsible pharmacist decides."""

    class Source(models.TextChoices):
        RETURN = "return", "Customer return"
        RECALL = "recall", "Batch recall"

    class Status(models.TextChoices):
        PENDING = "pending", "Awaiting decision"
        RESTOCKED = "restocked", "Back on the shelf"
        DESTROYED = "destroyed", "Destroyed"
        RETURNED = "returned", "Returned to supplier"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="+")
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name="quarantine")
    quantity_base = models.PositiveIntegerField()
    unit_cost = MoneyField()
    source = models.CharField(max_length=10, choices=Source.choices)
    source_id = models.UUIDField(null=True, blank=True)
    reason = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_base__gt=0), name="quarantine_qty_positive"
            )
        ]

    def __str__(self) -> str:
        return f"{self.batch_id} x {self.quantity_base}:{self.status}"


class Stocktake(OrgScopedModel):
    """A count against a snapshot. Approval applies (counted - snapshot), so movements made
    after the snapshot are never erased."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Counting"
        APPROVED = "approved", "Approved"

    class Scope(models.TextChoices):
        BRANCH = "branch", "Whole branch"
        CATEGORY = "category", "Category"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    scope = models.CharField(max_length=10, choices=Scope.choices)
    category = models.ForeignKey(
        "catalog.Category", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    snapshot_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    approved_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    impact = MoneyField(default=0)

    class Meta:
        ordering = ["-snapshot_at"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "number"], name="stocktake_number")
        ]

    def __str__(self) -> str:
        return self.number


class StocktakeLine(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stocktake = models.ForeignKey(Stocktake, on_delete=models.CASCADE, related_name="lines")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="+")
    system_base = models.IntegerField()
    unit_cost = MoneyField(default=0)
    counted_base = models.IntegerField(null=True, blank=True)
    applied_base = models.IntegerField(default=0)
    reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["item__code"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "stocktake", "item"], name="stocktake_item_once"
            ),
            models.CheckConstraint(
                condition=models.Q(counted_base__gte=0) | models.Q(counted_base__isnull=True),
                name="stocktake_count_not_negative",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.stocktake_id}:{self.item_id}"
