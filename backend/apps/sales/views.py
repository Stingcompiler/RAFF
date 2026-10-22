# Views authorize and delegate to services/.
from __future__ import annotations

import uuid
from typing import Any

from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import current_branch, current_device, has_code, idempotency_key, requires
from apps.accounts.models import User
from apps.audit.services.log import record
from apps.catalog.selectors import find_by_barcode
from apps.finance.models import Customer
from apps.finance.services.ledger import CreditLimitExceeded
from apps.inventory.services.stock import InsufficientStock
from apps.sales.models import HeldSale, Sale, Shift
from apps.sales.selectors import pos_items
from apps.sales.serializers import (
    CloseResultSerializer,
    CloseShiftSerializer,
    CustomerSerializer,
    HeldSaleSerializer,
    MissingItemSerializer,
    OpenShiftSerializer,
    PosItemSerializer,
    QuoteInSerializer,
    QuoteSerializer,
    SaleInSerializer,
    SaleReceiptSerializer,
    SaleResultSerializer,
    SaleSerializer,
    ShiftSerializer,
    ShiftSummarySerializer,
)
from apps.sales.services import held as held_service
from apps.sales.services import shifts
from apps.sales.services.posting import PaymentRequest, SaleError, lock_candidates, post_sale
from apps.sales.services.pricing import LineRequest, PricingError, quote
from apps.sales.services.receipt import receipt
from apps.sync.services.idempotency import KeyConflict, KeyMissing, KeyRace, replay


def _lines(data: list[dict[str, Any]]) -> list[LineRequest]:
    return [LineRequest(**line) for line in data]


def _bad(code: str, **detail: object) -> ValidationError:
    return ValidationError({"detail": code, **{k: str(v) for k, v in detail.items()}})


class PosItemsView(APIView):
    permission_classes = [requires("pos.sell")]

    @extend_schema(
        operation_id="pos_items",
        parameters=[
            OpenApiParameter("q", str, required=False),
            OpenApiParameter("ids", str, required=False, description="Comma-separated item ids"),
        ],
        responses=PosItemSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        raw = request.query_params.get("ids")
        ids = None
        if raw is not None:
            try:
                ids = [str(uuid.UUID(v)) for v in raw.split(",") if v]
            except ValueError:
                raise _bad("invalid_ids") from None
        rows = pos_items(current_branch(request), request.query_params.get("q", ""), ids=ids)
        return Response(PosItemSerializer(rows, many=True).data)


class PosBarcodeView(APIView):
    """Exact barcode → the item row and the scanned unit (added to the cart at once)."""

    permission_classes = [requires("pos.sell")]

    @extend_schema(
        operation_id="pos_barcode",
        parameters=[OpenApiParameter("code", str, required=True)],
        responses=PosItemSerializer,
    )
    def get(self, request: Request) -> Response:
        barcode = find_by_barcode(request.query_params.get("code", ""))
        if barcode is None:
            raise NotFound
        rows = [
            r
            for r in pos_items(current_branch(request), barcode.unit.item.code)
            if r["id"] == barcode.unit.item_id
        ]
        if not rows:
            raise NotFound
        row = rows[0]
        row["unit"] = barcode.unit
        return Response(PosItemSerializer(row).data)


class QuoteView(APIView):
    """Price a cart on the server (the POS shows these totals; it never computes them)."""

    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="sales_quote", request=QuoteInSerializer, responses=QuoteSerializer)
    def post(self, request: Request) -> Response:
        data = QuoteInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        branch = current_branch(request)
        try:
            q = quote(
                _lines(data.validated_data["lines"]), can_discount=has_code(request, "pos.discount")
            )
        except PricingError as exc:
            raise _bad(exc.code, line=exc.line) from None
        with transaction.atomic():
            # Read-only peek at stock; the posting re-checks under lock.
            candidates = lock_candidates(branch.pk, {line.item.pk for line in q.lines})
        lines = [
            {
                "line_no": line.line_no,
                "unit_price": line.unit_price,
                "line_subtotal": line.line_subtotal,
                "discount": line.discount,
                "line_total": line.line_total,
                "base_quantity": line.base_quantity,
                "available_base": sum(
                    b.quantity_base
                    for b in candidates.get(line.item.pk, [])
                    if not line.batch_id or b.batch_id == line.batch_id
                ),
            }
            for line in q.lines
        ]
        return Response(
            QuoteSerializer(
                {
                    "lines": lines,
                    "subtotal": q.subtotal,
                    "discount_total": q.discount_total,
                    "total": q.total,
                }
            ).data
        )


class SaleListView(APIView):
    permission_classes = [requires("pos.sell")]

    @extend_schema(
        operation_id="sales_post",
        request=SaleInSerializer,
        parameters=[
            OpenApiParameter(
                "Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True
            )
        ],
        responses={201: SaleResultSerializer},
    )
    def post(self, request: Request) -> Response:
        data = SaleInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        device = current_device(request)
        key = idempotency_key(request)
        assert isinstance(request.user, User)
        lines = _lines(v["lines"])
        payments = [PaymentRequest(**p) for p in v["payments"]]
        try:
            result = post_sale(
                device=device,
                user=request.user,
                lines=lines,
                payments=payments,
                customer_id=v["customer_id"],
                can_discount=has_code(request, "pos.discount"),
                idempotency_key=key,
            )
        except KeyRace:
            from apps.sales.services.posting import sale_payload

            try:
                with transaction.atomic():
                    result = replay(
                        "post_sale", key, sale_payload(device, v["customer_id"], lines, payments)
                    )
            except KeyConflict:
                return Response(
                    {"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT
                )
        except KeyConflict:
            return Response({"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT)
        except KeyMissing:
            raise _bad("idempotency_key_required") from None
        except (SaleError, PricingError) as exc:
            raise _bad(exc.code, **getattr(exc, "detail", {})) from None
        except InsufficientStock:
            raise _bad("insufficient_stock") from None
        except CreditLimitExceeded as exc:
            raise _bad("credit_limit_exceeded", available=exc.available) from None
        return Response(result, status=status.HTTP_201_CREATED)


class SaleByKeyView(APIView):
    """After a timeout: did the sale with this Idempotency-Key get recorded?"""

    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="sales_by_key", responses=SaleResultSerializer)
    def get(self, request: Request, key: str) -> Response:
        sale = Sale.objects.filter(idempotency_key=key).first()
        if sale is None:
            raise NotFound
        change = sum((p.change or 0 for p in sale.payments.all()), 0)
        return Response(
            {
                "id": str(sale.pk),
                "number": sale.number,
                "total": str(sale.total),
                "change": str(change),
            }
        )


def _sale(pk: str) -> Sale:
    sale: Sale | None = (
        Sale.objects.select_related("branch__organization", "device").filter(pk=pk).first()
    )
    if sale is None:
        raise NotFound
    return sale


class SaleDetailView(APIView):
    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="sales_retrieve", responses=SaleSerializer)
    def get(self, request: Request, pk: str) -> Response:
        return Response(SaleSerializer(_sale(pk)).data)


class SaleReceiptView(APIView):
    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="sales_receipt", responses=SaleReceiptSerializer)
    def get(self, request: Request, pk: str) -> Response:
        return Response(SaleReceiptSerializer(receipt(_sale(pk))).data)


class SalePrintView(APIView):
    """Record a (re)print; the receipt is printed from the counter (80mm, always light)."""

    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="sales_print", request=None, responses=SaleReceiptSerializer)
    def post(self, request: Request, pk: str) -> Response:
        sale = _sale(pk)
        with transaction.atomic():
            locked = Sale.objects.select_for_update().get(pk=sale.pk)
            reprint = request.query_params.get("reprint") == "1"
            if reprint:
                locked.reprints += 1
                locked.save(update_fields=["reprints"])
            assert isinstance(request.user, User)
            record(
                "reprint" if reprint else "print",
                "sale",
                sale.pk,
                actor=request.user,
                branch=sale.branch,
            )
        return Response(SaleReceiptSerializer(receipt(sale)).data)


class CurrentShiftView(APIView):
    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="shifts_current", responses=ShiftSummarySerializer)
    def get(self, request: Request) -> Response:
        shift = shifts.open_shift_for(current_device(request))
        if shift is None:
            empty = dict.fromkeys(
                ["sales_total", "sales_count", "cash", "bank", "credit", "expected_cash"]
            )
            return Response({"shift": None, **empty})
        return Response(ShiftSummarySerializer({"shift": shift, **shifts.summary(shift)}).data)


class ShiftOpenView(APIView):
    permission_classes = [requires("shifts.manage")]

    @extend_schema(
        operation_id="shifts_open", request=OpenShiftSerializer, responses={201: ShiftSerializer}
    )
    def post(self, request: Request) -> Response:
        data = OpenShiftSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        try:
            shift = shifts.open_shift(
                current_device(request), request.user, data.validated_data["opening_cash"]
            )
        except shifts.ShiftError as exc:
            raise _bad(exc.code) from None
        return Response(ShiftSerializer(shift).data, status=status.HTTP_201_CREATED)


class ShiftCloseView(APIView):
    permission_classes = [requires("shifts.manage")]

    @extend_schema(
        operation_id="shifts_close",
        request=CloseShiftSerializer,
        parameters=[
            OpenApiParameter(
                "Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True
            )
        ],
        responses=CloseResultSerializer,
    )
    def post(self, request: Request, pk: str) -> Response:
        if not Shift.objects.filter(pk=pk).exists():
            raise NotFound
        data = CloseShiftSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        try:
            result = shifts.close_shift(
                pk,  # type: ignore[arg-type]
                data.validated_data["counted_cash"],
                idempotency_key=idempotency_key(request),
                user=request.user,
            )
        except shifts.ShiftError as exc:
            raise _bad(exc.code) from None
        except KeyConflict:
            return Response({"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT)
        return Response(result)


class HeldListView(APIView):
    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="held_list", responses=HeldSaleSerializer(many=True))
    def get(self, request: Request) -> Response:
        rows = HeldSale.objects.filter(device=current_device(request)).select_related("created_by")
        return Response(HeldSaleSerializer(rows, many=True).data)

    @extend_schema(
        operation_id="held_create", request=QuoteInSerializer, responses={201: HeldSaleSerializer}
    )
    def post(self, request: Request) -> Response:
        data = QuoteInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        cart = [
            {k: str(v) if v is not None and k != "quantity" else v for k, v in line.items()}
            for line in data.validated_data["lines"]
        ]
        try:
            total = quote(_lines(data.validated_data["lines"]), can_discount=True).total
        except PricingError as exc:
            raise _bad(exc.code, line=exc.line) from None
        held = held_service.hold(current_device(request), request.user, cart, total)
        return Response(HeldSaleSerializer(held).data, status=status.HTTP_201_CREATED)


class HeldResumeView(APIView):
    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="held_resume", request=None, responses=HeldSaleSerializer)
    def post(self, request: Request, pk: str) -> Response:
        held = (
            HeldSale.objects.filter(pk=pk, device=current_device(request))
            .select_related("created_by")
            .first()
        )
        if held is None:
            raise NotFound
        body = HeldSaleSerializer(held).data
        held_service.resume(held)
        return Response(body)


class MissingItemView(APIView):
    """Log an item a customer asked for that the pharmacy does not stock."""

    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="pos_missing", request=MissingItemSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        data = MissingItemSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        branch = current_branch(request)
        assert isinstance(request.user, User)
        record(
            "missing_item",
            "branch",
            branch.pk,
            actor=request.user,
            branch=branch,
            query=data.validated_data["query"],
        )
        return Response(status=status.HTTP_201_CREATED)


class CustomerListView(APIView):
    def get_permissions(self) -> list[Any]:
        code = "finance.manage" if self.request.method == "POST" else "pos.sell"
        return [requires(code)()]

    @extend_schema(
        operation_id="customers_list",
        parameters=[OpenApiParameter("q", str, required=False)],
        responses=CustomerSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        qs = Customer.objects.filter(is_active=True)
        term = request.query_params.get("q", "").strip()
        if term:
            qs = qs.filter(
                Q(name_ar__icontains=term)
                | Q(name_en__icontains=term)
                | Q(phone__icontains=term)
                | Q(code__iexact=term)
            )
        return Response(CustomerSerializer(qs[:20], many=True).data)

    @extend_schema(
        operation_id="customers_create",
        request=CustomerSerializer,
        responses={201: CustomerSerializer},
    )
    def post(self, request: Request) -> Response:
        data = CustomerSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if Customer.objects.filter(code=data.validated_data["code"]).exists():
            raise _bad("code_taken")
        customer = Customer.objects.create(**data.validated_data)
        return Response(CustomerSerializer(customer).data, status=status.HTTP_201_CREATED)
