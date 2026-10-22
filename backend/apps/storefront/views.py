# Views authorize and delegate to services/.
from __future__ import annotations

from typing import Any

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.drf import requires
from apps.accounts.models import User
from apps.catalog.models import Item
from apps.catalog.selectors import current_price
from apps.catalog.services.items import ensure_default_price_lists
from apps.storefront import selectors
from apps.storefront.models import Listing
from apps.storefront.serializers import (
    ListingInSerializer,
    ListingRowSerializer,
    PublicCategorySerializer,
    PublicProductDetailSerializer,
    PublicProductSerializer,
    PublicStoreSerializer,
    SettingsSerializer,
)
from apps.storefront.services.listings import (
    ListingError,
    listing_for,
    missing,
    sale_unit,
    save_image,
    storefront_settings,
    update_listing,
)

SORTS = {"name", "price"}


class PublicView(APIView):
    """No session, no CSRF cookie needed for reads; rate limited per client."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "storefront"


class PublicStoreView(PublicView):
    @extend_schema(operation_id="public_store", responses=PublicStoreSerializer)
    def get(self, request: Request) -> Response:
        return Response(PublicStoreSerializer(storefront_settings()).data)


class PublicCategoriesView(PublicView):
    @extend_schema(operation_id="public_categories", responses=PublicCategorySerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(PublicCategorySerializer(selectors.categories(), many=True).data)


class PublicProductsView(PublicView):
    @extend_schema(
        operation_id="public_products",
        parameters=[
            OpenApiParameter("q", str, required=False),
            OpenApiParameter("category", str, required=False),
            OpenApiParameter("availability", str, enum=["available", "confirm"], required=False),
            OpenApiParameter("sort", str, enum=sorted(SORTS), required=False),
            OpenApiParameter("limit", int, required=False),
        ],
        responses=PublicProductSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        settings = storefront_settings()
        if not settings.enabled:
            return Response([])
        p = request.query_params
        rows = selectors.product_rows(
            settings, selectors.published(p.get("q", ""), p.get("category", ""))
        )
        if p.get("availability") in ("available", "confirm"):
            rows = [r for r in rows if r["availability"] == p["availability"]]
        if p.get("sort") == "price":
            rows.sort(key=lambda r: (r["price"] is None, r["price"] or 0))
        try:
            limit = int(p.get("limit", 200))
        except ValueError:
            limit = 200
        return Response(PublicProductSerializer(rows[: max(1, min(limit, 200))], many=True).data)


class PublicProductView(PublicView):
    @extend_schema(operation_id="public_product", responses=PublicProductDetailSerializer)
    def get(self, request: Request, slug: str) -> Response:
        settings = storefront_settings()
        listing = (
            Listing.objects.filter(slug=slug, published=True, item__is_active=True)
            .select_related("item__category")
            .prefetch_related("item__units")
            .first()
        )
        if listing is None or not settings.enabled:
            raise NotFound
        row = selectors.product_rows(settings, [listing], detail=True)[0]
        return Response(PublicProductDetailSerializer(row).data)


class StorefrontSettingsView(APIView):
    def get_permissions(self) -> list[Any]:
        return [requires("storefront.manage")()]

    @extend_schema(operation_id="storefront_settings", responses=SettingsSerializer)
    def get(self, request: Request) -> Response:
        return Response(SettingsSerializer(storefront_settings()).data)

    @extend_schema(
        operation_id="storefront_settings_update",
        request=SettingsSerializer,
        responses=SettingsSerializer,
    )
    def put(self, request: Request) -> Response:
        data = SettingsSerializer(storefront_settings(), data=request.data)
        data.is_valid(raise_exception=True)
        if data.validated_data.get("enabled") and not data.validated_data.get("branch"):
            raise ValidationError({"detail": "branch_required"})
        data.save()
        return Response(data.data)


def _listing_row(item: Item) -> dict[str, Any]:
    listing = listing_for(item)
    unit = sale_unit(item)
    price = current_price(unit, ensure_default_price_lists()) if unit else None
    return {
        "item_id": item.pk,
        "code": item.code,
        "name_ar": item.name_ar,
        "name_en": item.name_en,
        "strength": item.strength,
        "classification": item.classification,
        "slug": listing.slug,
        "published": listing.published,
        "description_ar": listing.description_ar,
        "description_en": listing.description_en,
        "image": listing.image.url if listing.image else None,
        "price": price.price if price else None,
        "missing": missing(listing),
    }


class ListingListView(APIView):
    permission_classes = [requires("storefront.manage")]

    @extend_schema(
        operation_id="storefront_listings",
        parameters=[OpenApiParameter("q", str, required=False)],
        responses=ListingRowSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        from apps.catalog.selectors import search_items

        items = list(search_items(request.query_params.get("q", ""), active=True)[:100])
        return Response(ListingRowSerializer([_listing_row(i) for i in items], many=True).data)


def _item(pk: str) -> Item:
    item: Item | None = Item.objects.prefetch_related("units").filter(pk=pk).first()
    if item is None:
        raise NotFound
    return item


class ListingDetailView(APIView):
    permission_classes = [requires("storefront.manage")]

    @extend_schema(
        operation_id="storefront_listing_update",
        request=ListingInSerializer,
        responses=ListingRowSerializer,
    )
    def patch(self, request: Request, pk: str) -> Response:
        item = _item(pk)
        data = ListingInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        try:
            update_listing(item, data.validated_data, request.user)
        except ListingError as exc:
            raise ValidationError(
                {"detail": exc.code, **{k: str(v) for k, v in exc.detail.items()}}
            ) from None
        return Response(ListingRowSerializer(_listing_row(item)).data)


class ListingImageView(APIView):
    permission_classes = [requires("storefront.manage")]
    parser_classes = [MultiPartParser]

    @extend_schema(
        operation_id="storefront_listing_image",
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {"image": {"type": "string", "format": "binary"}},
            }
        },
        responses={201: ListingRowSerializer},
    )
    def post(self, request: Request, pk: str) -> Response:
        item = _item(pk)
        upload = request.FILES.get("image")
        if upload is None:
            raise ValidationError({"detail": "image_required"})
        assert isinstance(request.user, User)
        try:
            save_image(item, upload, request.user)
        except ListingError as exc:
            raise ValidationError({"detail": exc.code}) from None
        return Response(
            ListingRowSerializer(_listing_row(item)).data, status=status.HTTP_201_CREATED
        )
