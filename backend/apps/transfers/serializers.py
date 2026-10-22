# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from typing import Any

from rest_framework import serializers


class TransferLineSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    item_id = serializers.UUIDField()
    code = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    strength = serializers.CharField()
    batch_id = serializers.UUIDField()
    batch_no = serializers.CharField()
    expiry_date = serializers.DateField(allow_null=True)
    quantity_base = serializers.IntegerField()
    received_base = serializers.IntegerField(allow_null=True)
    unit_ar = serializers.CharField()
    unit_en = serializers.CharField()
    factor = serializers.IntegerField()


class BranchRefSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()


class TransferSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    number = serializers.CharField(allow_blank=True)
    from_branch = BranchRefSerializer()
    to_branch = BranchRefSerializer()
    status = serializers.CharField()
    note = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()
    sent_at = serializers.DateTimeField(allow_null=True)
    received_at = serializers.DateTimeField(allow_null=True)
    lines_count = serializers.IntegerField()
    value = serializers.DecimalField(max_digits=18, decimal_places=4)


class TransferDetailSerializer(TransferSerializer):
    lines = TransferLineSerializer(many=True)


class TransferLineInSerializer(serializers.Serializer[None]):
    batch_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, help_text="In the item's default sale unit")


class TransferInSerializer(serializers.Serializer[None]):
    to_branch_id = serializers.UUIDField()
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    lines = TransferLineInSerializer(many=True, allow_empty=False)


class ReceivedLineSerializer(serializers.Serializer[None]):
    line_id = serializers.UUIDField()
    received = serializers.IntegerField(min_value=0, help_text="In the item's default sale unit")


class ReceiveInSerializer(serializers.Serializer[None]):
    lines = ReceivedLineSerializer(many=True)
