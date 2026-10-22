from __future__ import annotations

import uuid

from django.db import models

from apps.catalog.models import Item, ItemUnit
from apps.finance.money import MoneyField
from apps.tenancy.models import Branch, OrgScopedModel


class Supplier(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=40)
    name_ar = models.CharField(max_length=200)
    name_en = models.CharField(max_length=200)
    phone = models.CharField(max_length=40, blank=True)
    payment_terms_days = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="supplier_code_per_org")
        ]
        ordering = ["name_en"]

    def __str__(self) -> str:
        return self.name_en


class GoodsReceipt(OrgScopedModel):
    """A supplier invoice received into a branch. Drafts are editable; posted ones never."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="receipts")
    supplier_invoice_no = models.CharField(max_length=60)
    invoice_date = models.DateField()
    payment_terms_days = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)
    total = MoneyField(default=0)
    bonus_value = MoneyField(default=0)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "supplier", "supplier_invoice_no"],
                name="supplier_invoice_once",
            ),
            models.UniqueConstraint(
                fields=["organization", "number"],
                condition=~models.Q(number=""),
                name="receipt_number_unique",
            ),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.number or str(self.pk)


class GoodsReceiptLine(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name="lines")
    line_no = models.PositiveIntegerField()
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="+")
    unit = models.ForeignKey(ItemUnit, on_delete=models.PROTECT, related_name="+")
    quantity = models.PositiveIntegerField()
    bonus_quantity = models.PositiveIntegerField(default=0)
    unit_cost = MoneyField()
    discount = MoneyField(default=0)
    batch_no = models.CharField(max_length=40)
    expiry_date = models.DateField(null=True, blank=True)
    # Filled when the receipt is posted.
    base_quantity = models.PositiveIntegerField(default=0)
    cost_per_base = MoneyField(default=0)
    held = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "receipt", "line_no"], name="receipt_line_no"
            ),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="receipt_qty_positive"),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gte=0), name="receipt_cost_not_negative"
            ),
            models.CheckConstraint(
                condition=models.Q(discount__gte=0), name="receipt_discount_not_negative"
            ),
        ]
        ordering = ["line_no"]

    def __str__(self) -> str:
        return f"{self.receipt_id}#{self.line_no}"
