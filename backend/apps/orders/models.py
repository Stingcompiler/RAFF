from __future__ import annotations

import uuid

from django.db import models

from apps.catalog.models import Item, ItemUnit
from apps.finance.money import MoneyField
from apps.tenancy.models import Branch, OrgScopedModel


class Order(OrgScopedModel):
    """A guest's review request from the storefront. Not a sale, not a reservation."""

    class Status(models.TextChoices):
        NEW = "new", "New — awaiting review"
        NEEDS_CONTACT = "needs_contact", "Needs contact"
        CONFIRMED = "confirmed", "Confirmed"
        PREPARING = "preparing", "Preparing"
        READY = "ready", "Ready for pickup"
        OUT_FOR_DELIVERY = "out_for_delivery", "Out for delivery"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20)
    token = models.CharField(max_length=64)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    customer_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    note = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    estimated_total = MoneyField(default=0)
    assigned_to = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    reason = models.CharField(max_length=300, blank=True)
    internal_note = models.TextField(blank=True)
    idempotency_key = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "number"], name="order_number"),
            models.UniqueConstraint(fields=["organization", "token"], name="order_token"),
            models.UniqueConstraint(
                fields=["organization", "idempotency_key"], name="order_idempotency_key"
            ),
        ]
        indexes = [models.Index(fields=["status", "created_at"]), models.Index(fields=["phone"])]

    def __str__(self) -> str:
        return self.number


class OrderLine(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="+")
    unit = models.ForeignKey(ItemUnit, on_delete=models.PROTECT, related_name="+")
    quantity = models.PositiveIntegerField()
    published_price = MoneyField(null=True, blank=True)
    rx = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="order_qty_positive")
        ]

    def __str__(self) -> str:
        return f"{self.order_id}:{self.item_id}x{self.quantity}"


class OrderEvent(OrgScopedModel):
    """The order's timeline: every status change and edit, and who made it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    status = models.CharField(max_length=20, choices=Order.Status.choices)
    actor = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.order_id}:{self.status}"


class StockReservation(OrgScopedModel):
    """Units held on the shelf for a confirmed order. Selling them at the counter is refused;
    turning the order into a sale consumes them; cancelling releases them."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Held"
        CONSUMED = "consumed", "Sold"
        RELEASED = "released", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="reservations")
    line = models.ForeignKey(OrderLine, on_delete=models.CASCADE, related_name="reservations")
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="+")
    batch = models.ForeignKey("inventory.Batch", on_delete=models.PROTECT, related_name="+")
    quantity_base = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["branch", "item", "status"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_base__gt=0), name="reservation_qty_positive"
            )
        ]

    def __str__(self) -> str:
        return f"{self.order_id}:{self.batch_id}x{self.quantity_base}:{self.status}"


class OrderInvoiceLink(OrgScopedModel):
    """One order, one sale: the reference that stops an order becoming two invoices."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="+")
    sale = models.ForeignKey("sales.Sale", on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "order"], name="one_sale_per_order"),
            models.UniqueConstraint(fields=["organization", "sale"], name="one_order_per_sale"),
        ]

    def __str__(self) -> str:
        return f"{self.order_id}->{self.sale_id}"


class Inquiry(OrgScopedModel):
    """A question a visitor sent from the shop's contact page. Not an order, not a sale."""

    class Topic(models.TextChoices):
        MEDICINE = "medicine", "A medicine or product"
        ORDER = "order", "An order"
        AVAILABILITY = "availability", "Availability"
        OTHER = "other", "Something else"

    class Via(models.TextChoices):
        WHATSAPP = "whatsapp", "WhatsApp"
        CALL = "call", "Phone call"

    class Status(models.TextChoices):
        NEW = "new", "New"
        ANSWERED = "answered", "Answered"
        CLOSED = "closed", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20)
    customer_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    topic = models.CharField(max_length=15, choices=Topic.choices)
    contact_via = models.CharField(max_length=10, choices=Via.choices, default=Via.WHATSAPP)
    order_number = models.CharField(max_length=20, blank=True)
    message = models.CharField(max_length=1000)
    locale = models.CharField(max_length=5, default="ar")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.NEW)
    handled_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    handled_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "number"], name="inquiry_number"),
            models.UniqueConstraint(
                fields=["organization", "idempotency_key"], name="inquiry_idempotency_key"
            ),
        ]
        indexes = [models.Index(fields=["status", "created_at"]), models.Index(fields=["phone"])]

    def __str__(self) -> str:
        return self.number
