from __future__ import annotations

import uuid

from django.contrib.postgres.indexes import GinIndex
from django.db import models

from apps.finance.money import MoneyField
from apps.tenancy.models import OrgScopedModel


class Category(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=40)
    name_ar = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="category_code_per_org")
        ]
        ordering = ["name_en"]

    def __str__(self) -> str:
        return self.name_en


class Item(OrgScopedModel):
    """A sellable product. Quantities are integer base units (e.g. tablets)."""

    class Classification(models.TextChoices):
        OTC = "otc", "Over the counter"
        RX = "rx", "Prescription"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=40)
    name_ar = models.CharField(max_length=200)
    name_en = models.CharField(max_length=200)
    generic_name = models.CharField(max_length=200, blank=True)
    strength = models.CharField(max_length=60, blank=True)
    dosage_form = models.CharField(max_length=40, blank=True)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.PROTECT, related_name="items"
    )
    classification = models.CharField(
        max_length=3, choices=Classification.choices, default=Classification.OTC
    )
    reorder_level_base = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    search_normalized = models.TextField(editable=False, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="item_code_per_org")
        ]
        indexes = [
            GinIndex(
                name="item_search_trgm", fields=["search_normalized"], opclasses=["gin_trgm_ops"]
            ),
        ]
        ordering = ["name_en"]

    def __str__(self) -> str:
        return self.name_en


class ItemUnit(OrgScopedModel):
    """A unit an item is counted or sold in; `factor` base units make one of it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="units")
    code = models.CharField(max_length=20)
    name_ar = models.CharField(max_length=40)
    name_en = models.CharField(max_length=40)
    factor = models.PositiveIntegerField()
    is_base = models.BooleanField(default=False)
    is_default_sale = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "item", "code"], name="unit_code_per_item"
            ),
            models.UniqueConstraint(
                fields=["organization", "item"],
                condition=models.Q(is_base=True),
                name="one_base_unit",
            ),
            models.UniqueConstraint(
                fields=["organization", "item"],
                condition=models.Q(is_default_sale=True),
                name="one_default_sale_unit",
            ),
            models.CheckConstraint(condition=models.Q(factor__gte=1), name="unit_factor_positive"),
            models.CheckConstraint(
                condition=~models.Q(is_base=True) | models.Q(factor=1), name="base_unit_factor_one"
            ),
        ]
        ordering = ["factor"]

    def __str__(self) -> str:
        return f"{self.item_id}:{self.code}"


class Barcode(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit = models.ForeignKey(ItemUnit, on_delete=models.CASCADE, related_name="barcodes")
    code = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="barcode_per_org")
        ]

    def __str__(self) -> str:
        return self.code


class PriceList(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20)
    name_ar = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80)
    is_default = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"], name="price_list_code_per_org"
            ),
            models.UniqueConstraint(
                fields=["organization"],
                condition=models.Q(is_default=True),
                name="one_default_price_list",
            ),
        ]

    def __str__(self) -> str:
        return self.code


class ItemPrice(OrgScopedModel):
    """A price version. Never edited: a change is a new row with a later effective date."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    price_list = models.ForeignKey(PriceList, on_delete=models.PROTECT, related_name="prices")
    unit = models.ForeignKey(ItemUnit, on_delete=models.CASCADE, related_name="prices")
    price = MoneyField()
    effective_from = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        "accounts.User", null=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "price_list", "unit", "effective_from"],
                name="price_version_unique",
            ),
            models.CheckConstraint(condition=models.Q(price__gte=0), name="price_not_negative"),
        ]
        indexes = [models.Index(fields=["unit", "price_list", "-effective_from"])]

    def __str__(self) -> str:
        return f"{self.unit_id}@{self.effective_from}"


class ImportBatch(OrgScopedModel):
    """One CSV import: previewed first, applied once (idempotent by `id`)."""

    class Status(models.TextChoices):
        PREVIEW = "preview", "Preview"
        APPLIED = "applied", "Applied"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file_name = models.CharField(max_length=200)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PREVIEW)
    rows = models.JSONField(default=list)
    summary = models.JSONField(default=dict)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.file_name
