# Views authorize and delegate to services/.
from __future__ import annotations

from typing import Any

from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import current_branch, idempotency_key, requires
from apps.accounts.models import User
from apps.catalog.models import Category, Item
from apps.catalog.selectors import search_items
from apps.catalog.views import Pages, _with_price
from apps.inventory.models import Batch, QuarantineEntry, Stocktake
from apps.inventory.selectors import (
    batches_for_item,
    movements_for_item,
    stock_for_items,
    stocktake_rows,
)
from apps.inventory.serializers import (
    BatchRowSerializer,
    CountsInSerializer,
    DecisionSerializer,
    MovementSerializer,
    QuarantineEntrySerializer,
    RecallSerializer,
    ReleaseSerializer,
    StockItemSerializer,
    StocktakeApproveResultSerializer,
    StocktakeDetailSerializer,
    StocktakeSerializer,
    StocktakeStartSerializer,
)
from apps.inventory.services import quarantine, stocktake
from apps.inventory.services.stock import InsufficientStock
from apps.purchasing.services.receiving import ReceiptError, release_held
from apps.sync.services.idempotency import KeyConflict, KeyRace, replay


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


def _bad(code: str, **detail: object) -> ValidationError:
    return ValidationError({"detail": code, **{k: str(v) for k, v in detail.items()}})


def _conflict() -> Response:
    return Response({"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT)


class QuarantineListView(APIView):
    permission_classes = [requires("inventory.view")]

    @extend_schema(
        operation_id="quarantine_list",
        parameters=[OpenApiParameter("status", str, required=False, enum=["pending", "decided"])],
        responses=QuarantineEntrySerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        rows = (
            QuarantineEntry.objects.filter(branch=current_branch(request))
            .select_related("item", "batch")
            .prefetch_related("item__units")
        )
        if request.query_params.get("status", "pending") == "pending":
            rows = rows.filter(status=QuarantineEntry.Status.PENDING)
        else:
            rows = rows.exclude(status=QuarantineEntry.Status.PENDING)[:50]
        return Response(QuarantineEntrySerializer(rows, many=True).data)


class QuarantineDecideView(APIView):
    """Restock, destroy or return to supplier — the responsible pharmacist's decision."""

    permission_classes = [requires("quarantine.decide")]

    @extend_schema(
        operation_id="quarantine_decide",
        request=DecisionSerializer,
        parameters=[
            OpenApiParameter(
                "Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True
            )
        ],
        responses=QuarantineEntrySerializer,
    )
    def post(self, request: Request, pk: str) -> Response:
        data = DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        entry = QuarantineEntry.objects.filter(pk=pk, branch=current_branch(request)).first()
        if entry is None:
            raise NotFound
        assert isinstance(request.user, User)
        key = idempotency_key(request)
        payload = {
            "entry": str(entry.pk),
            "decision": data.validated_data["decision"],
            "note": data.validated_data["note"],
        }
        try:
            quarantine.decide(
                entry.pk,
                data.validated_data["decision"],
                data.validated_data["note"],
                idempotency_key=key,
                user=request.user,
            )
        except KeyRace:
            try:
                with transaction.atomic():
                    replay("quarantine_decide", key, payload)
            except KeyConflict:
                return _conflict()
        except KeyConflict:
            return _conflict()
        except quarantine.QuarantineError as exc:
            raise _bad(exc.code) from None
        except InsufficientStock:
            raise _bad("insufficient_stock") from None
        entry.refresh_from_db()
        return Response(QuarantineEntrySerializer(entry).data)


class RecallView(APIView):
    """Hold a whole batch (recall): shelf and review stock move to quarantine."""

    permission_classes = [requires("quarantine.decide")]

    @extend_schema(
        operation_id="quarantine_recall",
        request=RecallSerializer,
        parameters=[
            OpenApiParameter(
                "Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True
            )
        ],
        responses={201: QuarantineEntrySerializer},
    )
    def post(self, request: Request) -> Response:
        data = RecallSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not Batch.objects.filter(pk=data.validated_data["batch_id"]).exists():
            raise NotFound
        branch = current_branch(request)
        assert isinstance(request.user, User)
        key = idempotency_key(request)
        payload = {
            "batch": str(data.validated_data["batch_id"]),
            "branch": str(branch.pk),
            "reason": data.validated_data["reason"],
        }
        try:
            result = quarantine.recall(
                branch,
                data.validated_data["batch_id"],
                data.validated_data["reason"],
                idempotency_key=key,
                user=request.user,
            )
        except KeyRace:
            try:
                with transaction.atomic():
                    result = replay("recall", key, payload)
            except KeyConflict:
                return _conflict()
        except KeyConflict:
            return _conflict()
        except quarantine.QuarantineError as exc:
            raise _bad(exc.code) from None
        entry = QuarantineEntry.objects.select_related("item", "batch").get(pk=result["id"])
        return Response(QuarantineEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


def _stocktake(request: Request, pk: str) -> Stocktake:
    take: Stocktake | None = (
        Stocktake.objects.filter(pk=pk, branch=current_branch(request))
        .select_related("category")
        .first()
    )
    if take is None:
        raise NotFound
    return take


class StocktakeListView(APIView):
    def get_permissions(self) -> list[Any]:
        code = "stocktake.approve" if self.request.method == "POST" else "inventory.view"
        return [requires(code)()]

    @extend_schema(operation_id="stocktakes_list", responses=StocktakeSerializer(many=True))
    def get(self, request: Request) -> Response:
        takes = Stocktake.objects.filter(branch=current_branch(request)).select_related("category")[
            :30
        ]
        return Response(
            StocktakeSerializer(
                [stocktake_rows(t, with_lines=False) for t in takes], many=True
            ).data
        )

    @extend_schema(
        operation_id="stocktakes_start",
        request=StocktakeStartSerializer,
        responses={201: StocktakeDetailSerializer},
    )
    def post(self, request: Request) -> Response:
        data = StocktakeStartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        category = None
        if data.validated_data["category_id"]:
            category = Category.objects.filter(pk=data.validated_data["category_id"]).first()
            if category is None:
                raise _bad("unknown_category")
        assert isinstance(request.user, User)
        take = stocktake.start(current_branch(request), category=category, user=request.user)
        return Response(
            StocktakeDetailSerializer(stocktake_rows(take, with_lines=True)).data,
            status=status.HTTP_201_CREATED,
        )


class StocktakeDetailView(APIView):
    def get_permissions(self) -> list[Any]:
        code = "stocktake.approve" if self.request.method == "PATCH" else "inventory.view"
        return [requires(code)()]

    @extend_schema(operation_id="stocktakes_retrieve", responses=StocktakeDetailSerializer)
    def get(self, request: Request, pk: str) -> Response:
        take = _stocktake(request, pk)
        return Response(StocktakeDetailSerializer(stocktake_rows(take, with_lines=True)).data)

    @extend_schema(
        operation_id="stocktakes_count",
        request=CountsInSerializer,
        responses=StocktakeDetailSerializer,
    )
    def patch(self, request: Request, pk: str) -> Response:
        take = _stocktake(request, pk)
        data = CountsInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        factors = stocktake_rows(take, with_lines=True)["lines"]
        by_id = {str(line["id"]): line["factor"] for line in factors}
        counts = []
        for c in data.validated_data["lines"]:
            factor = by_id.get(str(c["line_id"]))
            if factor is None:
                raise _bad("unknown_line")
            units = c["counted_units"]
            counts.append(
                {
                    "line_id": c["line_id"],
                    "counted_base": None if units is None else units * factor + c["loose_base"],
                    "reason": c["reason"],
                }
            )
        assert isinstance(request.user, User)
        try:
            take = stocktake.save_counts(take.pk, counts, request.user)
        except stocktake.StocktakeError as exc:
            raise _bad(exc.code) from None
        return Response(StocktakeDetailSerializer(stocktake_rows(take, with_lines=True)).data)


class StocktakeApproveView(APIView):
    permission_classes = [requires("stocktake.approve")]

    @extend_schema(
        operation_id="stocktakes_approve",
        request=None,
        parameters=[
            OpenApiParameter(
                "Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True
            )
        ],
        responses=StocktakeApproveResultSerializer,
    )
    def post(self, request: Request, pk: str) -> Response:
        take = _stocktake(request, pk)
        assert isinstance(request.user, User)
        key = idempotency_key(request)
        try:
            result = stocktake.approve(take.pk, idempotency_key=key, user=request.user)
        except KeyRace:
            try:
                with transaction.atomic():
                    result = replay("stocktake_approve", key, {"stocktake": str(take.pk)})
            except KeyConflict:
                return _conflict()
        except KeyConflict:
            return _conflict()
        except stocktake.StocktakeError as exc:
            raise _bad(exc.code, **exc.detail) from None
        return Response(StocktakeApproveResultSerializer(result).data)
