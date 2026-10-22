# Views authorize and delegate to services/.
from __future__ import annotations

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import current_branch, requires
from apps.accounts.models import User
from apps.catalog.models import Item
from apps.catalog.selectors import search_items
from apps.catalog.views import Pages, _with_price
from apps.inventory.models import Batch
from apps.inventory.selectors import batches_for_item, movements_for_item, stock_for_items
from apps.inventory.serializers import (
    BatchRowSerializer,
    MovementSerializer,
    ReleaseSerializer,
    StockItemSerializer,
)
from apps.purchasing.services.receiving import ReceiptError, release_held


def _item(pk: str) -> Item:
    item: Item | None = Item.objects.filter(pk=pk).first()
    if item is None:
        raise NotFound
    return item


class StockListView(APIView):
    """Items with their stock in the session's branch (Items & stock screen)."""

    permission_classes = [requires("inventory.view")]

    @extend_schema(
        operation_id="inventory_items",
        parameters=[
            OpenApiParameter("q", str, required=False),
            OpenApiParameter("category", str, required=False),
            OpenApiParameter("limit", int, required=False),
            OpenApiParameter("offset", int, required=False),
        ],
        responses=StockItemSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        branch = current_branch(request)
        qs = _with_price(
            search_items(
                request.query_params.get("q", ""),
                category=request.query_params.get("category") or None,
                active=None,
            )
        )
        pages = Pages()
        page: list[Item] = pages.paginate_queryset(qs, request, view=self) or []
        stock = stock_for_items(branch, page)
        return pages.get_paginated_response(
            StockItemSerializer(page, many=True, context={"stock": stock}).data
        )


class ItemBatchesView(APIView):
    permission_classes = [requires("inventory.view")]

    @extend_schema(operation_id="inventory_item_batches", responses=BatchRowSerializer(many=True))
    def get(self, request: Request, pk: str) -> Response:
        return Response(
            BatchRowSerializer(batches_for_item(current_branch(request), _item(pk)), many=True).data
        )


class ItemStockView(APIView):
    """One item with its stock in the session's branch (item drawer)."""

    permission_classes = [requires("inventory.view")]

    @extend_schema(operation_id="inventory_item", responses=StockItemSerializer)
    def get(self, request: Request, pk: str) -> Response:
        item = _with_price(Item.objects.filter(pk=_item(pk).pk).prefetch_related("units")).get()
        stock = stock_for_items(current_branch(request), [item])
        return Response(StockItemSerializer(item, context={"stock": stock}).data)


class ItemMovementsView(APIView):
    permission_classes = [requires("inventory.view")]

    @extend_schema(operation_id="inventory_item_movements", responses=MovementSerializer(many=True))
    def get(self, request: Request, pk: str) -> Response:
        rows = movements_for_item(current_branch(request), _item(pk))
        return Response(MovementSerializer(rows, many=True).data)


class ReleaseBatchView(APIView):
    """Give a held batch its expiry date and make it sellable."""

    permission_classes = [requires("purchasing.receive")]

    @extend_schema(
        operation_id="inventory_batch_release",
        request=ReleaseSerializer,
        responses=BatchRowSerializer(many=True),
    )
    def post(self, request: Request, pk: str) -> Response:
        batch = Batch.objects.select_related("item").filter(pk=pk).first()
        if batch is None:
            raise NotFound
        data = ReleaseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        branch = current_branch(request)
        assert isinstance(request.user, User)
        try:
            release_held(batch, branch, data.validated_data["expiry_date"], request.user)
        except ReceiptError as exc:
            raise ValidationError({"detail": exc.code}) from None
        return Response(BatchRowSerializer(batches_for_item(branch, batch.item), many=True).data)
