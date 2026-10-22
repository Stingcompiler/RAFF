# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.serializers import ItemListSerializer
from apps.inventory.models import QuarantineEntry, StockMovement
from apps.tenancy import clock


class StockSerializer(serializers.Serializer[Any]):
    sellable_base = serializers.IntegerField()
    held_base = serializers.IntegerField()
    nearest_expiry = serializers.DateField(allow_null=True)
    cost_per_base = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    cost_per_sale_unit = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
    margin_pct = serializers.DecimalField(max_digits=6, decimal_places=1, allow_null=True)
    status = serializers.ChoiceField(["good", "near_expiry", "low", "out", "expired"])


class StockItemSerializer(ItemListSerializer):
    stock = serializers.SerializerMethodField()

    class Meta(ItemListSerializer.Meta):
        fields = [*ItemListSerializer.Meta.fields, "reorder_level_base", "stock"]

    @extend_schema_field(StockSerializer)
    def get_stock(self, item: Any) -> dict[str, Any]:
        return dict(StockSerializer(self.context["stock"][item.pk]).data)


class BatchRowSerializer(serializers.Serializer[Any]):
    batch_id = serializers.UUIDField()
    batch_no = serializers.CharField()
    expiry_date = serializers.DateField(allow_null=True)
    quantity_base = serializers.IntegerField()
    location = serializers.CharField()
    unit_cost = serializers.DecimalField(max_digits=18, decimal_places=4)
    status = serializers.ChoiceField(["good", "near_expiry", "expired", "held", "quarantined"])


class MovementSerializer(serializers.ModelSerializer[StockMovement]):
    batch_no = serializers.CharField(source="batch.batch_no")
    location = serializers.CharField(source="location.kind")

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "kind",
            "quantity_base",
            "unit_cost",
            "batch_no",
            "location",
            "document_type",
            "document_id",
            "created_at",
        ]


class ReleaseSerializer(serializers.Serializer[None]):
    expiry_date = serializers.DateField()


class UnitNamesSerializer(serializers.Serializer[Any]):
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    factor = serializers.IntegerField()
    base_ar = serializers.CharField()
    base_en = serializers.CharField()


class QuarantineEntrySerializer(serializers.ModelSerializer[QuarantineEntry]):
    item_code = serializers.CharField(source="item.code", read_only=True)
    item_name_ar = serializers.CharField(source="item.name_ar", read_only=True)
    item_name_en = serializers.CharField(source="item.name_en", read_only=True)
    strength = serializers.CharField(source="item.strength", read_only=True)
    batch_no = serializers.CharField(source="batch.batch_no", read_only=True)
    expiry_date = serializers.DateField(source="batch.expiry_date", read_only=True)
    expired = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()

    class Meta:
        model = QuarantineEntry
        fields = [
            "id",
            "item_code",
            "item_name_ar",
            "item_name_en",
            "strength",
            "batch_no",
            "expiry_date",
            "expired",
            "unit",
            "quantity_base",
            "source",
            "reason",
            "status",
            "created_at",
            "decided_at",
            "decision_note",
        ]

    @extend_schema_field(UnitNamesSerializer)
    def get_unit(self, obj: QuarantineEntry) -> dict[str, Any]:
        """The item's default sale unit and its base unit, to show quantities in packs."""
        units = list(obj.item.units.all())
        sale = next((u for u in units if u.is_default_sale), None)
        base = next((u for u in units if u.is_base), None) or sale
        return {
            "name_ar": sale.name_ar if sale else "",
            "name_en": sale.name_en if sale else "",
            "factor": sale.factor if sale else 1,
            "base_ar": base.name_ar if base else "",
            "base_en": base.name_en if base else "",
        }

    def get_expired(self, obj: QuarantineEntry) -> bool:
        return obj.batch.expiry_date is None or obj.batch.expiry_date < clock.today()


class DecisionSerializer(serializers.Serializer[None]):
    decision = serializers.ChoiceField(choices=["restock", "destroy", "return"])
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class RecallSerializer(serializers.Serializer[None]):
    batch_id = serializers.UUIDField()
    reason = serializers.CharField(max_length=200)


class StocktakeLineSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    item_id = serializers.UUIDField()
    code = serializers.CharField()
    name_ar = serializers.CharField()
    name_en = serializers.CharField()
    strength = serializers.CharField()
    unit_ar = serializers.CharField()
    unit_en = serializers.CharField()
    factor = serializers.IntegerField()
    system_base = serializers.IntegerField()
    counted_base = serializers.IntegerField(allow_null=True)
    variance_base = serializers.IntegerField(allow_null=True)
    applied_base = serializers.IntegerField()
    reason = serializers.CharField(allow_blank=True)
    reason_required = serializers.BooleanField()
    value = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)


class StocktakeSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    number = serializers.CharField()
    scope = serializers.CharField()
    category_name_ar = serializers.CharField(allow_null=True)
    category_name_en = serializers.CharField(allow_null=True)
    status = serializers.CharField()
    snapshot_at = serializers.DateTimeField()
    approved_at = serializers.DateTimeField(allow_null=True)
    impact = serializers.DecimalField(max_digits=18, decimal_places=4)
    counted = serializers.IntegerField()
    total = serializers.IntegerField()


class StocktakeDetailSerializer(StocktakeSerializer):
    lines = StocktakeLineSerializer(many=True)


class StocktakeStartSerializer(serializers.Serializer[None]):
    category_id = serializers.UUIDField(required=False, allow_null=True, default=None)


class CountInSerializer(serializers.Serializer[None]):
    line_id = serializers.UUIDField()
    counted_units = serializers.IntegerField(min_value=0, allow_null=True)
    loose_base = serializers.IntegerField(min_value=0, default=0)
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class CountsInSerializer(serializers.Serializer[None]):
    lines = CountInSerializer(many=True)


class StocktakeApproveResultSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    impact = serializers.DecimalField(max_digits=18, decimal_places=4)
    adjusted_items = serializers.IntegerField()
