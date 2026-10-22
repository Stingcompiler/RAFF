# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from decimal import Decimal
from typing import Any

from rest_framework import serializers

from apps.catalog.serializers import UnitSerializer
from apps.finance.models import Customer
from apps.sales.models import HeldSale, Payment, Sale, SaleLine, Shift


class PosItemSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    generic_name = serializers.CharField()
    strength = serializers.CharField()
    dosage_form = serializers.CharField()
    rx = serializers.BooleanField()
    unit = UnitSerializer(allow_null=True)
    units = UnitSerializer(many=True)
    price = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    sellable_base = serializers.IntegerField()
    nearest_expiry = serializers.DateField(allow_null=True)
    status = serializers.ChoiceField(["good", "near_expiry", "low", "out", "expired"])
    barcodes = serializers.ListField(child=serializers.CharField())


class LineInSerializer(serializers.Serializer[None]):
    item_id = serializers.UUIDField()
    unit_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=9999)
    discount_pct = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal(0),
        max_value=Decimal(100),
        default=Decimal(0),
    )
    batch_id = serializers.UUIDField(required=False, allow_null=True, default=None)


class QuoteInSerializer(serializers.Serializer[None]):
    lines = LineInSerializer(many=True, allow_empty=False)


class QuoteLineSerializer(serializers.Serializer[Any]):
    line_no = serializers.IntegerField()
    unit_price = serializers.DecimalField(max_digits=18, decimal_places=4)
    line_subtotal = serializers.DecimalField(max_digits=18, decimal_places=4)
    discount = serializers.DecimalField(max_digits=18, decimal_places=4)
    line_total = serializers.DecimalField(max_digits=18, decimal_places=4)
    available_base = serializers.IntegerField()
    base_quantity = serializers.IntegerField()


class QuoteSerializer(serializers.Serializer[Any]):
    lines = QuoteLineSerializer(many=True)
    subtotal = serializers.DecimalField(max_digits=18, decimal_places=4)
    discount_total = serializers.DecimalField(max_digits=18, decimal_places=4)
    total = serializers.DecimalField(max_digits=18, decimal_places=4)


class PaymentInSerializer(serializers.Serializer[None]):
    method = serializers.ChoiceField(Payment.Method.choices)
    amount = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))
    tendered = serializers.DecimalField(
        max_digits=18, decimal_places=4, required=False, allow_null=True, default=None
    )
    bank_reference = serializers.CharField(
        max_length=60, required=False, allow_blank=True, default=""
    )
    bank_account = serializers.CharField(
        max_length=60, required=False, allow_blank=True, default=""
    )


class SaleInSerializer(serializers.Serializer[None]):
    lines = LineInSerializer(many=True, allow_empty=False)
    payments = PaymentInSerializer(many=True, allow_empty=False)
    customer_id = serializers.UUIDField(required=False, allow_null=True, default=None)


class SaleResultSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    number = serializers.CharField()
    total = serializers.DecimalField(max_digits=18, decimal_places=4)
    change = serializers.DecimalField(max_digits=18, decimal_places=4)


class SaleReceiptLineSerializer(serializers.Serializer[Any]):
    name = serializers.CharField()
    total = serializers.CharField()


class SaleReceiptPaymentSerializer(serializers.Serializer[Any]):
    # Named like the frontend's ReceiptData; shadows Field.label on purpose.
    label = serializers.CharField()  # type: ignore[assignment]
    amount = serializers.CharField()


class SaleReceiptSerializer(serializers.Serializer[Any]):
    locale = serializers.ChoiceField(["ar", "en"])
    shop = serializers.CharField()
    branch = serializers.CharField()
    number = serializers.CharField()
    issuedAt = serializers.CharField()
    lines = SaleReceiptLineSerializer(many=True)
    totalLabel = serializers.CharField()
    total = serializers.CharField()
    payments = SaleReceiptPaymentSerializer(many=True)
    footer = serializers.CharField()


class SaleLineOutSerializer(serializers.ModelSerializer[SaleLine]):
    class Meta:
        model = SaleLine
        fields = ["line_no", "item", "unit", "quantity", "unit_price", "discount_pct", "line_total"]


class SaleSerializer(serializers.ModelSerializer[Sale]):
    lines = SaleLineOutSerializer(many=True)

    class Meta:
        model = Sale
        fields = [
            "id",
            "number",
            "subtotal",
            "discount_total",
            "total",
            "posted_at",
            "reprints",
            "lines",
        ]


class ShiftSerializer(serializers.ModelSerializer[Shift]):
    class Meta:
        model = Shift
        fields = [
            "id",
            "number",
            "status",
            "opened_at",
            "opening_cash",
            "closed_at",
            "expected_cash",
            "counted_cash",
            "variance",
        ]


class ShiftSummarySerializer(serializers.Serializer[Any]):
    shift = ShiftSerializer(allow_null=True)
    sales_total = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    sales_count = serializers.IntegerField(allow_null=True)
    cash = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    bank = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    credit = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    expected_cash = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)


class OpenShiftSerializer(serializers.Serializer[None]):
    opening_cash = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal(0))


class CloseShiftSerializer(serializers.Serializer[None]):
    counted_cash = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal(0))


class CloseResultSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    expected_cash = serializers.DecimalField(max_digits=18, decimal_places=4)
    counted_cash = serializers.DecimalField(max_digits=18, decimal_places=4)
    variance = serializers.DecimalField(max_digits=18, decimal_places=4)


class HeldSaleSerializer(serializers.ModelSerializer[HeldSale]):
    created_by_name_ar = serializers.CharField(source="created_by.display_name_ar", read_only=True)
    created_by_name_en = serializers.CharField(source="created_by.display_name_en", read_only=True)

    class Meta:
        model = HeldSale
        fields = ["id", "created_at", "cart", "total", "created_by_name_ar", "created_by_name_en"]
        read_only_fields = ["id", "created_at"]


class CustomerSerializer(serializers.ModelSerializer[Customer]):
    class Meta:
        model = Customer
        fields = [
            "id",
            "code",
            "name_ar",
            "name_en",
            "phone",
            "credit_limit",
            "balance",
            "is_active",
        ]
        read_only_fields = ["balance"]


class MissingItemSerializer(serializers.Serializer[None]):
    query = serializers.CharField(max_length=120)


class ShiftLogSerializer(ShiftSummarySerializer):
    device_ar = serializers.CharField()
    device_en = serializers.CharField()
    opened_by_ar = serializers.CharField()
    opened_by_en = serializers.CharField()
    settled = serializers.BooleanField()
