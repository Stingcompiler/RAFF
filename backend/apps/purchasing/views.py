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
from apps.inventory.services.stock import InsufficientStock
from apps.purchasing.models import GoodsReceipt, Supplier
from apps.purchasing.serializers import (
    PostResultSerializer,
    ReceiptInputSerializer,
    ReceiptListSerializer,
    ReceiptSerializer,
    SupplierSerializer,
)
from apps.purchasing.services.receiving import LineInput, ReceiptError, post_receipt, save_draft
from apps.sync.services.idempotency import KeyConflict, KeyMissing, KeyRace, replay


def _error(exc: ReceiptError) -> ValidationError:
    return ValidationError({"detail": exc.code, **{k: str(v) for k, v in exc.detail.items()}})


def _receipt(pk: str) -> GoodsReceipt:
    receipt: GoodsReceipt | None = (
        GoodsReceipt.objects.select_related("supplier")
        .prefetch_related("lines__item", "lines__unit")
        .filter(pk=pk)
        .first()
    )
    if receipt is None:
        raise NotFound
    return receipt


class SupplierListView(APIView):
    def get_permissions(self) -> list[Any]:
        code = "purchasing.receive" if self.request.method == "POST" else "inventory.view"
        return [requires(code)()]

    @extend_schema(operation_id="suppliers_list", responses=SupplierSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(SupplierSerializer(Supplier.objects.filter(is_active=True), many=True).data)

    @extend_schema(
        operation_id="suppliers_create",
        request=SupplierSerializer,
        responses={201: SupplierSerializer},
    )
    def post(self, request: Request) -> Response:
        data = SupplierSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if Supplier.objects.filter(code=data.validated_data["code"]).exists():
            raise ValidationError({"detail": "code_taken"})
        supplier = Supplier.objects.create(**data.validated_data)
        return Response(SupplierSerializer(supplier).data, status=status.HTTP_201_CREATED)


def _save(request: Request, receipt: GoodsReceipt | None) -> GoodsReceipt:
    data = ReceiptInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    v = data.validated_data
    supplier = Supplier.objects.filter(pk=v["supplier_id"]).first()
    if supplier is None:
        raise ValidationError({"supplier_id": "unknown"})
    assert isinstance(request.user, User)
    try:
        return save_draft(
            receipt=receipt,
            branch=current_branch(request),
            supplier=supplier,
            supplier_invoice_no=v["supplier_invoice_no"],
            invoice_date=v["invoice_date"],
            payment_terms_days=v["payment_terms_days"],
            notes=v["notes"],
            lines=[LineInput(**line) for line in v["lines"]],
            user=request.user,
        )
    except ReceiptError as exc:
        raise _error(exc) from None


class ReceiptListView(APIView):
    def get_permissions(self) -> list[Any]:
        code = "purchasing.receive" if self.request.method == "POST" else "inventory.view"
        return [requires(code)()]

    @extend_schema(
        operation_id="receipts_list",
        parameters=[OpenApiParameter("status", str, required=False)],
        responses=ReceiptListSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        qs = GoodsReceipt.objects.filter(branch=current_branch(request)).select_related("supplier")
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        return Response(ReceiptListSerializer(qs[:200], many=True).data)

    @extend_schema(
        operation_id="receipts_create",
        request=ReceiptInputSerializer,
        responses={201: ReceiptSerializer},
    )
    def post(self, request: Request) -> Response:
        receipt = _save(request, None)
        return Response(
            ReceiptSerializer(_receipt(str(receipt.pk))).data, status=status.HTTP_201_CREATED
        )


class ReceiptDetailView(APIView):
    def get_permissions(self) -> list[Any]:
        code = "purchasing.receive" if self.request.method == "PUT" else "inventory.view"
        return [requires(code)()]

    @extend_schema(operation_id="receipts_retrieve", responses=ReceiptSerializer)
    def get(self, request: Request, pk: str) -> Response:
        return Response(ReceiptSerializer(_receipt(pk)).data)

    @extend_schema(
        operation_id="receipts_update", request=ReceiptInputSerializer, responses=ReceiptSerializer
    )
    def put(self, request: Request, pk: str) -> Response:
        _save(request, _receipt(pk))
        return Response(ReceiptSerializer(_receipt(pk)).data)


class ReceiptPostView(APIView):
    """Post (approve) a draft receipt. Requires an Idempotency-Key header."""

    permission_classes = [requires("purchasing.receive")]

    @extend_schema(
        operation_id="receipts_post",
        request=None,
        parameters=[
            OpenApiParameter(
                "Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True
            )
        ],
        responses=PostResultSerializer,
    )
    def post(self, request: Request, pk: str) -> Response:
        receipt = _receipt(pk)
        key = idempotency_key(request)
        assert isinstance(request.user, User)
        try:
            result = post_receipt(receipt.pk, idempotency_key=key, user=request.user)
        except KeyRace:
            with transaction.atomic():
                try:
                    result = replay("post_receipt", key, {"receipt": str(receipt.pk)})
                except KeyConflict:
                    return Response(
                        {"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT
                    )
        except KeyConflict:
            return Response({"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT)
        except KeyMissing:
            raise ValidationError({"detail": "idempotency_key_required"}) from None
        except ReceiptError as exc:
            raise _error(exc) from None
        except InsufficientStock:
            raise ValidationError({"detail": "insufficient_stock"}) from None
        return Response(result)
