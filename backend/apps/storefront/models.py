from __future__ import annotations

import uuid

from django.db import models

from apps.catalog.models import Item
from apps.tenancy.models import Branch, OrgScopedModel


class StorefrontSettings(OrgScopedModel):
    """The pharmacy's public site: identity, contact, and which branch serves orders."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enabled = models.BooleanField(default=False)
    branch = models.ForeignKey(
        Branch, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    name_ar = models.CharField(max_length=120, blank=True)
    name_en = models.CharField(max_length=120, blank=True)
    brand_color = models.CharField(max_length=7, default="#245C4F")
    hero_title_ar = models.CharField(max_length=200, blank=True)
    hero_title_en = models.CharField(max_length=200, blank=True)
    hero_lead_ar = models.TextField(blank=True)
    hero_lead_en = models.TextField(blank=True)
    address_ar = models.CharField(max_length=200, blank=True)
    address_en = models.CharField(max_length=200, blank=True)
    hours = models.CharField(max_length=60, blank=True)
    whatsapp = models.CharField(max_length=20, blank=True)
    about_ar = models.TextField(blank=True)
    about_en = models.TextField(blank=True)
    orders_per_hour = models.PositiveIntegerField(default=10)
    blocked_phones = models.TextField(blank=True, help_text="One phone number per line")
    telegram_chat_id = models.CharField(max_length=40, blank=True)
    # Paying before pickup by bank transfer, and home delivery: both off until the pharmacy
    # fills in its accounts / is ready to deliver (D-R0021).
    prepay_enabled = models.BooleanField(default=False)
    bank_accounts = models.TextField(blank=True, help_text="Shown to customers who prepay")
    payment_hold_hours = models.PositiveIntegerField(default=24)
    delivery_enabled = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization"], name="one_storefront")]

    def __str__(self) -> str:
        return self.name_en or "storefront"


class Listing(OrgScopedModel):
    """An item as the public sees it. Nothing is public until a staff member publishes it,
    and publishing needs the listing to be complete."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="listings")
    slug = models.SlugField(max_length=80)
    published = models.BooleanField(default=False)
    description_ar = models.TextField(blank=True)
    description_en = models.TextField(blank=True)
    image = models.FileField(upload_to="listings/", blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "slug"], name="listing_slug")
        ]
        indexes = [models.Index(fields=["published"])]

    def __str__(self) -> str:
        return self.slug
