# Views authorize and delegate to services/.
from __future__ import annotations

import csv
from typing import Any

from django.db.models import OuterRef
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import requires
from apps.accounts.models import User
from apps.catalog.models import Category, ImportBatch, Item, ItemUnit, PriceList
from apps.catalog.selectors import current_price_subquery, find_by_barcode, search_items
from apps.catalog.serializers import (
    BarcodeLookupSerializer,
    CategorySerializer,
    ImportBatchSerializer,
    ImportUploadSerializer,
    ItemCreateSerializer,
    ItemDetailSerializer,
    ItemListSerializer,
    ItemUpdateSerializer,
    PriceInputSerializer,
    PriceListSerializer,
)
from apps.catalog.services import imports
from apps.catalog.services.items import (
    CatalogError,
    UnitSpec,
    create_item,
    ensure_default_price_lists,
    set_price,
    update_item,
)


def _error(exc: CatalogError) -> ValidationError:
    return ValidationError({"detail": exc.code, **{k: str(v) for k, v in exc.detail.items()}})


def _with_price(qs: Any) -> Any:
    """Annotate the default sale unit's current retail price."""
    retail = ensure_default_price_lists()
    return qs.annotate(
        sale_unit_id=ItemUnit.objects.filter(item=OuterRef("pk"), is_default_sale=True).values(
            "pk"
        )[:1]
    ).annotate(price=current_price_subquery("sale_unit_id", retail, timezone.localdate()))


def _item(pk: str) -> Item:
    item: Item | None = Item.objects.filter(pk=pk).first()
    if item is None:
        raise NotFound
    return item


class Pages(LimitOffsetPagination):
    default_limit = 50
    max_limit = 200


class ItemListView(APIView):
    def get_permissions(self) -> list[Any]:
        code = "inventory.manage" if self.request.method == "POST" else "inventory.view"
        return [requires(code)()]

    @extend_schema(
        operation_id="catalog_items_list",
        parameters=[
            OpenApiParameter("q", str, required=False),
            OpenApiParameter("category", str, required=False),
            OpenApiParameter("active", bool, required=False),
            OpenApiParameter("limit", int, required=False),
            OpenApiParameter("offset", int, required=False),
        ],
        responses=ItemListSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        active_param = request.query_params.get("active")
        active = None if active_param == "all" else active_param != "false"
        qs = search_items(
            request.query_params.get("q", ""),
            category=request.query_params.get("category") or None,
            active=active,
        )
        qs = _with_price(qs)
        pages = Pages()
        page: list[Item] | None = pages.paginate_queryset(qs, request, view=self)
        return pages.get_paginated_response(ItemListSerializer(page, many=True).data)

    @extend_schema(
        operation_id="catalog_items_create",
        request=ItemCreateSerializer,
        responses={201: ItemDetailSerializer},
    )
    def post(self, request: Request) -> Response:
        data = ItemCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        category = None
        if v.get("category_id"):
            category = Category.objects.filter(pk=v["category_id"]).first()
            if category is None:
                raise ValidationError({"category_id": "unknown"})
        try:
            item = create_item(
                code=v["code"],
                name_ar=v["name_ar"],
                name_en=v["name_en"],
                generic_name=v["generic_name"],
                strength=v["strength"],
                dosage_form=v["dosage_form"],
                category=category,
                classification=v["classification"],
                reorder_level_base=v["reorder_level_base"],
                units=[UnitSpec(**u) for u in v["units"]],
            )
            if "price" in v:
                sale = item.units.get(is_default_sale=True)
                assert isinstance(request.user, User)
                set_price(sale, v["price"], user=request.user)
        except CatalogError as exc:
            raise _error(exc) from None
        return Response(
            ItemDetailSerializer(_with_price(Item.objects.filter(pk=item.pk)).get()).data,
            status=status.HTTP_201_CREATED,
        )


class ItemDetailView(APIView):
    def get_permissions(self) -> list[Any]:
        code = "inventory.manage" if self.request.method == "PATCH" else "inventory.view"
        return [requires(code)()]

    @extend_schema(operation_id="catalog_items_retrieve", responses=ItemDetailSerializer)
    def get(self, request: Request, pk: str) -> Response:
        _item(pk)
        return Response(ItemDetailSerializer(_with_price(Item.objects.filter(pk=pk)).get()).data)

    @extend_schema(
        operation_id="catalog_items_update",
        request=ItemUpdateSerializer,
        responses=ItemDetailSerializer,
    )
    def patch(self, request: Request, pk: str) -> Response:
        item = _item(pk)
        data = ItemUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        changes = dict(data.validated_data)
        if "category_id" in changes:
            cid = changes.pop("category_id")
            changes["category"] = Category.objects.filter(pk=cid).first() if cid else None
            if cid and changes["category"] is None:
                raise ValidationError({"category_id": "unknown"})
        try:
            update_item(item, **changes)
        except CatalogError as exc:
            raise _error(exc) from None
        return Response(ItemDetailSerializer(_with_price(Item.objects.filter(pk=pk)).get()).data)


class ItemPriceView(APIView):
    permission_classes = [requires("inventory.manage")]

    @extend_schema(
        operation_id="catalog_items_price",
        request=PriceInputSerializer,
        responses=ItemDetailSerializer,
    )
    def post(self, request: Request, pk: str) -> Response:
        item = _item(pk)
        data = PriceInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        unit = item.units.filter(pk=v["unit_id"]).first()
        price_list = PriceList.objects.filter(code=v["price_list"]).first()
        if unit is None or price_list is None:
            raise ValidationError({"detail": "unknown_unit_or_list"})
        assert isinstance(request.user, User)
        try:
            set_price(
                unit,
                v["price"],
                price_list=price_list,
                effective_from=v.get("effective_from"),
                user=request.user,
            )
        except CatalogError as exc:
            raise _error(exc) from None
        return Response(ItemDetailSerializer(_with_price(Item.objects.filter(pk=pk)).get()).data)


class BarcodeLookupView(APIView):
    permission_classes = [requires("inventory.view")]

    @extend_schema(
        operation_id="catalog_barcode_lookup",
        parameters=[OpenApiParameter("code", str, required=True)],
        responses=BarcodeLookupSerializer,
    )
    def get(self, request: Request) -> Response:
        barcode = find_by_barcode(request.query_params.get("code", ""))
        if barcode is None:
            raise NotFound
        item = _with_price(Item.objects.filter(pk=barcode.unit.item_id)).get()
        return Response(BarcodeLookupSerializer({"item": item, "unit": barcode.unit}).data)


class CategoryListView(APIView):
    def get_permissions(self) -> list[Any]:
        code = "inventory.manage" if self.request.method == "POST" else "inventory.view"
        return [requires(code)()]

    @extend_schema(operation_id="catalog_categories_list", responses=CategorySerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(CategorySerializer(Category.objects.all(), many=True).data)

    @extend_schema(
        operation_id="catalog_categories_create",
        request=CategorySerializer,
        responses={201: CategorySerializer},
    )
    def post(self, request: Request) -> Response:
        data = CategorySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if Category.objects.filter(code=data.validated_data["code"]).exists():
            raise ValidationError({"detail": "code_taken"})
        category = Category.objects.create(**data.validated_data)
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)


class PriceListListView(APIView):
    permission_classes = [requires("inventory.view")]

    @extend_schema(operation_id="catalog_price_lists", responses=PriceListSerializer(many=True))
    def get(self, request: Request) -> Response:
        ensure_default_price_lists()
        return Response(PriceListSerializer(PriceList.objects.all(), many=True).data)


class ImportView(APIView):
    permission_classes = [requires("inventory.manage")]
    parser_classes = [MultiPartParser]

    @extend_schema(
        operation_id="catalog_imports_preview",
        request={"multipart/form-data": ImportUploadSerializer},
        responses={201: ImportBatchSerializer},
    )
    def post(self, request: Request) -> Response:
        data = ImportUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        upload = data.validated_data["file"]
        if upload.size > 5 * 1024 * 1024:
            raise ValidationError({"detail": "file_too_large"})
        assert isinstance(request.user, User)
        try:
            batch = imports.preview(upload.name, upload.read(), request.user)
        except CatalogError as exc:
            raise _error(exc) from None
        return Response(ImportBatchSerializer(batch).data, status=status.HTTP_201_CREATED)


class ImportDetailView(APIView):
    permission_classes = [requires("inventory.manage")]

    @extend_schema(operation_id="catalog_imports_retrieve", responses=ImportBatchSerializer)
    def get(self, request: Request, pk: str) -> Response:
        batch = ImportBatch.objects.filter(pk=pk).first()
        if batch is None:
            raise NotFound
        return Response(ImportBatchSerializer(batch).data)


class ImportApplyView(APIView):
    permission_classes = [requires("inventory.manage")]

    @extend_schema(
        operation_id="catalog_imports_apply", request=None, responses=ImportBatchSerializer
    )
    def post(self, request: Request, pk: str) -> Response:
        batch = ImportBatch.objects.filter(pk=pk).first()
        if batch is None:
            raise NotFound
        assert isinstance(request.user, User)
        batch = imports.apply(batch, request.user)
        return Response(ImportBatchSerializer(batch).data)


class ExportView(APIView):
    permission_classes = [requires("inventory.view")]

    @extend_schema(operation_id="catalog_items_export", responses={(200, "text/csv"): str})
    def get(self, request: Request) -> HttpResponse:
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="items.csv"'
        response.write("\ufeff")  # BOM: Excel opens UTF-8 Arabic correctly
        csv.writer(response).writerows(imports.export_rows())
        return response
