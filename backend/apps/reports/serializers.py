from __future__ import annotations

from typing import Any

from rest_framework import serializers


class ReportColumnSerializer(serializers.Serializer[Any]):
    key = serializers.CharField()
    label_ar = serializers.CharField()
    label_en = serializers.CharField()
    kind = serializers.CharField()


class ReportSerializer(serializers.Serializer[Any]):
    name = serializers.CharField()
    start = serializers.DateField()
    end = serializers.DateField()
    days = serializers.IntegerField()
    columns = ReportColumnSerializer(many=True)
    rows = serializers.ListField(child=serializers.DictField())
    totals = serializers.DictField()


class NeedsActionSerializer(serializers.Serializer[Any]):
    expiring = serializers.IntegerField()
    below_reorder = serializers.IntegerField()
    receivables = serializers.IntegerField()
    unsettled_shifts = serializers.IntegerField()
    transfers_awaiting = serializers.IntegerField()
    store_orders = serializers.IntegerField()
    pending_sync = serializers.IntegerField()


class OverviewShiftSerializer(serializers.Serializer[Any]):
    number = serializers.IntegerField()
    opened_at = serializers.DateTimeField()
    user_ar = serializers.CharField()
    user_en = serializers.CharField()


class DayTotalSerializer(serializers.Serializer[Any]):
    date = serializers.DateField()
    total = serializers.DecimalField(max_digits=18, decimal_places=4)


class OperationSerializer(serializers.Serializer[Any]):
    at = serializers.DateTimeField()
    kind = serializers.ChoiceField(choices=["sale", "return"])
    number = serializers.CharField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=4)
    status = serializers.ChoiceField(choices=["approved", "verifying", "to_inspect"])


class OverviewSerializer(serializers.Serializer[Any]):
    needs_action = NeedsActionSerializer()
    near_expiry_days = serializers.IntegerField()
    sales_today = serializers.DecimalField(max_digits=18, decimal_places=4)
    sales_count = serializers.IntegerField()
    cash_today = serializers.DecimalField(max_digits=18, decimal_places=4)
    bank_today = serializers.DecimalField(max_digits=18, decimal_places=4)
    open_shift = OverviewShiftSerializer(allow_null=True)
    week = DayTotalSerializer(many=True)
    latest = OperationSerializer(many=True)
