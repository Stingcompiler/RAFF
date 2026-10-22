# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.serializers import ItemListSerializer
from apps.inventory.models import StockMovement


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
