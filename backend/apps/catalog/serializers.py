# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Barcode, Category, ImportBatch, Item, ItemPrice, ItemUnit, PriceList


class CategorySerializer(serializers.ModelSerializer[Category]):
    class Meta:
        model = Category
        fields = ["id", "code", "name_ar", "name_en"]


class PriceListSerializer(serializers.ModelSerializer[PriceList]):
    class Meta:
        model = PriceList
        fields = ["id", "code", "name_ar", "name_en", "is_default"]


class PriceSerializer(serializers.ModelSerializer[ItemPrice]):
    price_list = serializers.CharField(source="price_list.code")
    unit = serializers.CharField(source="unit.code")

    class Meta:
        model = ItemPrice
        fields = ["id", "price_list", "unit", "price", "effective_from", "created_at"]


class UnitSerializer(serializers.ModelSerializer[ItemUnit]):
    barcodes = serializers.SlugRelatedField[Barcode](many=True, read_only=True, slug_field="code")

    class Meta:
        model = ItemUnit
        fields = [
            "id",
            "code",
            "name_ar",
            "name_en",
            "factor",
            "is_base",
            "is_default_sale",
            "barcodes",
        ]


class ItemListSerializer(serializers.ModelSerializer[Item]):
    category = CategorySerializer(allow_null=True)
    sale_unit = serializers.SerializerMethodField()
    price = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)

    class Meta:
        model = Item
        fields = [
            "id",
            "code",
            "name_ar",
            "name_en",
            "generic_name",
            "strength",
            "dosage_form",
            "classification",
            "category",
            "is_active",
            "sale_unit",
            "price",
        ]

    @extend_schema_field(UnitSerializer(allow_null=True))
    def get_sale_unit(self, item: Item) -> dict[str, object] | None:
        unit = next((u for u in item.units.all() if u.is_default_sale), None)
        return UnitSerializer(unit).data if unit else None


class ItemDetailSerializer(ItemListSerializer):
    units = UnitSerializer(many=True, read_only=True)
    prices = serializers.SerializerMethodField()

    class Meta(ItemListSerializer.Meta):
        fields = [
            *ItemListSerializer.Meta.fields,
            "reorder_level_base",
            "units",
            "prices",
            "updated_at",
        ]

    @extend_schema_field(PriceSerializer(many=True))
    def get_prices(self, item: Item) -> list[dict[str, object]]:
        qs = (
            ItemPrice.objects.filter(unit__item=item)
            .select_related("price_list", "unit")
            .order_by("-effective_from")
        )
        return list(PriceSerializer(qs[:50], many=True).data)


class UnitInputSerializer(serializers.Serializer[None]):
    code = serializers.SlugField(max_length=20)
    name_ar = serializers.CharField(max_length=40)
    name_en = serializers.CharField(max_length=40)
    factor = serializers.IntegerField(min_value=1)
    is_base = serializers.BooleanField(default=False)
    is_default_sale = serializers.BooleanField(default=False)
    barcodes = serializers.ListField(child=serializers.CharField(max_length=64), default=list)


class ItemCreateSerializer(serializers.Serializer[None]):
    code = serializers.CharField(max_length=40)
    name_ar = serializers.CharField(max_length=200)
    name_en = serializers.CharField(max_length=200)
    generic_name = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=""
    )
    strength = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    dosage_form = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    category_id = serializers.UUIDField(required=False, allow_null=True)
    classification = serializers.ChoiceField(choices=Item.Classification.choices, default="otc")
    reorder_level_base = serializers.IntegerField(min_value=0, default=0)
    units = UnitInputSerializer(many=True, allow_empty=False)
    price = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=0, required=False)


class ItemUpdateSerializer(serializers.Serializer[None]):
    name_ar = serializers.CharField(max_length=200, required=False)
    name_en = serializers.CharField(max_length=200, required=False)
    generic_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    strength = serializers.CharField(max_length=60, required=False, allow_blank=True)
    dosage_form = serializers.CharField(max_length=40, required=False, allow_blank=True)
    category_id = serializers.UUIDField(required=False, allow_null=True)
    classification = serializers.ChoiceField(choices=Item.Classification.choices, required=False)
    reorder_level_base = serializers.IntegerField(min_value=0, required=False)
    is_active = serializers.BooleanField(required=False)


class PriceInputSerializer(serializers.Serializer[None]):
    unit_id = serializers.UUIDField()
    price = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=0)
    price_list = serializers.CharField(max_length=20, default="retail")
    effective_from = serializers.DateField(required=False)


class BarcodeLookupSerializer(serializers.Serializer[dict[str, Any]]):
    item = ItemListSerializer()
    unit = UnitSerializer()


class ImportUploadSerializer(serializers.Serializer[None]):
    file = serializers.FileField()


class ImportBatchSerializer(serializers.ModelSerializer[ImportBatch]):
    class Meta:
        model = ImportBatch
        fields = ["id", "file_name", "status", "summary", "rows", "created_at", "applied_at"]


class BarcodeSerializer(serializers.ModelSerializer[Barcode]):
    class Meta:
        model = Barcode
        fields = ["id", "code"]
