from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.returns.models import SaleReturn, SaleReturnLine


class ReturnableLineSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    line_no = serializers.IntegerField()
    item_id = serializers.UUIDField()
    code = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    strength = serializers.CharField()
    unit_ar = serializers.CharField()
    unit_en = serializers.CharField()
    quantity = serializers.IntegerField()
    returned = serializers.IntegerField()
    returnable = serializers.IntegerField()
    line_total = serializers.DecimalField(max_digits=18, decimal_places=4)


class ReturnableSaleSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    number = serializers.CharField()
    posted_at = serializers.DateTimeField()
    total = serializers.DecimalField(max_digits=18, decimal_places=4)
    customer_name_ar = serializers.CharField(allow_null=True)
    customer_name_en = serializers.CharField(allow_null=True)
    default_refund = serializers.ChoiceField(choices=SaleReturn.Refund.choices)
    lines = ReturnableLineSerializer(many=True)


class ReturnLineInSerializer(serializers.Serializer[None]):
    sale_line_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    reason = serializers.ChoiceField(choices=SaleReturnLine.Reason.choices)
    condition = serializers.ChoiceField(choices=SaleReturnLine.Condition.choices)


class ReturnInSerializer(serializers.Serializer[None]):
    sale_id = serializers.UUIDField()
    refund_method = serializers.ChoiceField(choices=SaleReturn.Refund.choices)
    lines = ReturnLineInSerializer(many=True, allow_empty=False)


class ReturnResultSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    number = serializers.CharField()
    total = serializers.DecimalField(max_digits=18, decimal_places=4)


class ReturnListSerializer(serializers.ModelSerializer[SaleReturn]):
    sale_number = serializers.CharField(source="sale.number", read_only=True)
    lines_count = serializers.SerializerMethodField()

    class Meta:
        model = SaleReturn
        fields = [
            "id",
            "number",
            "sale_number",
            "refund_method",
            "total",
            "posted_at",
            "lines_count",
        ]

    def get_lines_count(self, obj: SaleReturn) -> int:
        return obj.lines.count()
