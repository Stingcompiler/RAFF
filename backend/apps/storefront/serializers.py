# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

import re
from typing import Any

from rest_framework import serializers

from apps.storefront.models import StorefrontSettings


class PublicStoreSerializer(serializers.Serializer[Any]):
    enabled = serializers.BooleanField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    brand_color = serializers.CharField()
    hero_title_ar = serializers.CharField()
    hero_title_en = serializers.CharField()
    hero_lead_ar = serializers.CharField()
    hero_lead_en = serializers.CharField()
    address_ar = serializers.CharField()
    address_en = serializers.CharField()
    hours = serializers.CharField()
    whatsapp = serializers.CharField()
    about_ar = serializers.CharField()
    about_en = serializers.CharField()
    prepay_enabled = serializers.BooleanField()
    bank_accounts = serializers.CharField()
    payment_hold_hours = serializers.IntegerField()
    delivery_enabled = serializers.BooleanField()


class PublicCategorySerializer(serializers.Serializer[Any]):
    code = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    count = serializers.IntegerField()


class PublicProductSerializer(serializers.Serializer[Any]):
    slug = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    strength = serializers.CharField()
    unit_ar = serializers.CharField()
    unit_en = serializers.CharField()
    category = serializers.CharField(allow_null=True)
    rx = serializers.BooleanField()
    price = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    price_date = serializers.DateField(allow_null=True)
    availability = serializers.ChoiceField(
        choices=["available", "confirm", "unavailable"], allow_null=True
    )
    image = serializers.CharField(allow_null=True)


class PublicProductDetailSerializer(PublicProductSerializer):
    description_ar = serializers.CharField()
    description_en = serializers.CharField()


class SettingsSerializer(serializers.ModelSerializer[StorefrontSettings]):
    class Meta:
        model = StorefrontSettings
        fields = [
            "enabled",
            "branch",
            "name_ar",
            "name_en",
            "brand_color",
            "hero_title_ar",
            "hero_title_en",
            "hero_lead_ar",
            "hero_lead_en",
            "address_ar",
            "address_en",
            "hours",
            "whatsapp",
            "about_ar",
            "about_en",
            "orders_per_hour",
            "blocked_phones",
            "telegram_chat_id",
            "prepay_enabled",
            "bank_accounts",
            "payment_hold_hours",
            "delivery_enabled",
        ]

    def validate_payment_hold_hours(self, value: int) -> int:
        if not 1 <= value <= 168:
            raise serializers.ValidationError("hold_hours_range")
        return value

    def validate_brand_color(self, value: str) -> str:
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            raise serializers.ValidationError("hex_color")
        return value.upper()


class ListingRowSerializer(serializers.Serializer[Any]):
    item_id = serializers.UUIDField()
    code = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    strength = serializers.CharField()
    classification = serializers.CharField()
    slug = serializers.CharField()
    published = serializers.BooleanField()
    description_ar = serializers.CharField(allow_blank=True)
    description_en = serializers.CharField(allow_blank=True)
    image = serializers.CharField(allow_null=True)
    price = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    missing = serializers.ListField(child=serializers.CharField())


class ListingInSerializer(serializers.Serializer[None]):
    published = serializers.BooleanField(required=False)
    description_ar = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    description_en = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    slug = serializers.CharField(required=False, max_length=80)
