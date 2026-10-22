# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.orders.models import Order

STATUS = [c[0] for c in Order.Status.choices]


class OrderLineInSerializer(serializers.Serializer[None]):
    slug = serializers.SlugField(max_length=80)
    quantity = serializers.IntegerField(min_value=1, max_value=20)


class PlaceOrderSerializer(serializers.Serializer[None]):
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    agree = serializers.BooleanField()
    lines = OrderLineInSerializer(many=True, allow_empty=False)

    def validate_agree(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError("policy_required")
        return value


class PlacedSerializer(serializers.Serializer[Any]):
    number = serializers.CharField()
    token = serializers.CharField()
    status = serializers.ChoiceField(choices=STATUS)


class TrackSerializer(serializers.Serializer[None]):
    number = serializers.CharField(max_length=20)
    phone = serializers.CharField(max_length=20)


class TokenSerializer(serializers.Serializer[Any]):
    token = serializers.CharField()


class PublicLineSerializer(serializers.Serializer[Any]):
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    strength = serializers.CharField()
    unit_ar = serializers.CharField()
    unit_en = serializers.CharField()
    quantity = serializers.IntegerField()
    price = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    rx = serializers.BooleanField()


class PublicEventSerializer(serializers.Serializer[Any]):
    status = serializers.ChoiceField(choices=STATUS)
    at = serializers.DateTimeField()


class PublicOrderSerializer(serializers.Serializer[Any]):
    number = serializers.CharField()
    status = serializers.ChoiceField(choices=STATUS)
    created_at = serializers.DateTimeField()
    estimated_total = serializers.DecimalField(max_digits=18, decimal_places=4)
    lines = PublicLineSerializer(many=True)
    events = PublicEventSerializer(many=True)
    whatsapp = serializers.CharField()


class StaffOrderRowSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    number = serializers.CharField()
    created_at = serializers.DateTimeField()
    customer_name = serializers.CharField()
    phone = serializers.CharField()
    lines_count = serializers.IntegerField()
    estimated_total = serializers.DecimalField(max_digits=18, decimal_places=4)
    status = serializers.ChoiceField(choices=STATUS)
    assigned_ar = serializers.CharField(allow_null=True)
    assigned_en = serializers.CharField(allow_null=True)
    unread = serializers.BooleanField()


class StaffLineSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    item_id = serializers.UUIDField()
    code = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    strength = serializers.CharField()
    unit_ar = serializers.CharField()
    unit_en = serializers.CharField()
    factor = serializers.IntegerField()
    quantity = serializers.IntegerField()
    rx = serializers.BooleanField()
    published_price = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    current_price = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    available_units = serializers.IntegerField()


class StaffEventSerializer(serializers.Serializer[Any]):
    status = serializers.ChoiceField(choices=STATUS)
    at = serializers.DateTimeField()
    actor_ar = serializers.CharField(allow_null=True)
    actor_en = serializers.CharField(allow_null=True)
    note = serializers.CharField(allow_blank=True)


class StaffOrderSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    number = serializers.CharField()
    token = serializers.CharField()
    status = serializers.ChoiceField(choices=STATUS)
    created_at = serializers.DateTimeField()
    customer_name = serializers.CharField()
    phone = serializers.CharField()
    note = serializers.CharField(allow_blank=True)
    reason = serializers.CharField(allow_blank=True)
    internal_note = serializers.CharField(allow_blank=True)
    estimated_total = serializers.DecimalField(max_digits=18, decimal_places=4)
    allowed = serializers.ListField(child=serializers.ChoiceField(choices=STATUS))
    lines = StaffLineSerializer(many=True)
    events = StaffEventSerializer(many=True)
    sale_number = serializers.CharField(allow_null=True)
    whatsapp = serializers.CharField()


class TransitionSerializer(serializers.Serializer[None]):
    to = serializers.ChoiceField(choices=STATUS)
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class EditLinesSerializer(serializers.Serializer[None]):
    quantities = serializers.DictField(child=serializers.IntegerField(min_value=0, max_value=20))
    consent = serializers.CharField(max_length=300)


class NoteSerializer(serializers.Serializer[None]):
    internal_note = serializers.CharField(max_length=2000, allow_blank=True)


class OrdersSummarySerializer(serializers.Serializer[Any]):
    unread = serializers.IntegerField()
    new = serializers.IntegerField()
    confirmed = serializers.IntegerField()
    completed = serializers.IntegerField()
