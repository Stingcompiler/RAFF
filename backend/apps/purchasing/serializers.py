# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine, Supplier
from apps.purchasing.selectors import bonus_allocated


class SupplierSerializer(serializers.ModelSerializer[Supplier]):
    class Meta:
        model = Supplier
        fields = ["id", "code", "name_ar", "name_en", "phone", "payment_terms_days", "is_active"]


class ReceiptLineSerializer(serializers.ModelSerializer[GoodsReceiptLine]):
    item_name_ar = serializers.CharField(source="item.name_ar", read_only=True)
    item_name_en = serializers.CharField(source="item.name_en", read_only=True)
    unit_name_ar = serializers.CharField(source="unit.name_ar", read_only=True)
    unit_name_en = serializers.CharField(source="unit.name_en", read_only=True)

    class Meta:
        model = GoodsReceiptLine
        fields = [
            "id",
            "line_no",
            "item",
            "unit",
            "item_name_ar",
            "item_name_en",
            "unit_name_ar",
            "unit_name_en",
            "quantity",
            "bonus_quantity",
            "unit_cost",
            "discount",
            "batch_no",
            "expiry_date",
            "base_quantity",
            "cost_per_base",
            "held",
        ]


class ReceiptSerializer(serializers.ModelSerializer[GoodsReceipt]):
    supplier = SupplierSerializer()
    lines = ReceiptLineSerializer(many=True)
    bonus_allocated = serializers.SerializerMethodField()

    class Meta:
        model = GoodsReceipt
        fields = [
            "id",
            "number",
            "status",
            "branch",
            "supplier",
            "supplier_invoice_no",
            "invoice_date",
            "payment_terms_days",
            "notes",
            "total",
            "bonus_value",
            "bonus_allocated",
            "created_at",
            "posted_at",
            "lines",
        ]

    @extend_schema_field(serializers.DecimalField(max_digits=18, decimal_places=4))
    def get_bonus_allocated(self, receipt: GoodsReceipt) -> str:
        return str(bonus_allocated(receipt))


class ReceiptListSerializer(serializers.ModelSerializer[GoodsReceipt]):
    supplier = SupplierSerializer()
    line_count = serializers.IntegerField(source="lines.count")

    class Meta:
        model = GoodsReceipt
        fields = [
            "id",
            "number",
            "status",
            "supplier",
            "supplier_invoice_no",
            "invoice_date",
            "total",
            "line_count",
            "posted_at",
        ]


class LineInputSerializer(serializers.Serializer[None]):
    item_id = serializers.UUIDField()
    unit_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    bonus_quantity = serializers.IntegerField(min_value=0, default=0)
    unit_cost = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=0)
    discount = serializers.DecimalField(
        max_digits=18, decimal_places=4, min_value=0, default=Decimal(0)
    )
    batch_no = serializers.CharField(max_length=40, allow_blank=True)
    expiry_date = serializers.DateField(allow_null=True, required=False, default=None)


class ReceiptInputSerializer(serializers.Serializer[None]):
    supplier_id = serializers.UUIDField()
    supplier_invoice_no = serializers.CharField(max_length=60)
    invoice_date = serializers.DateField()
    payment_terms_days = serializers.IntegerField(min_value=0, default=0)
    notes = serializers.CharField(allow_blank=True, default="")
    lines = LineInputSerializer(many=True)


class PostResultSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    number = serializers.CharField()
    total = serializers.DecimalField(max_digits=18, decimal_places=4)
    held_lines = serializers.IntegerField()
