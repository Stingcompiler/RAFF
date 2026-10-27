# Views authorize and delegate to services/.
from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.drf import current_branch, idempotency_key, requires
from apps.accounts.models import User
from apps.notifications.models import Notification
from apps.notifications.services.notify import mark_read, unread_orders
from apps.orders.models import Inquiry, Order
from apps.orders.selectors import public_order, staff_order
from apps.orders.serializers import (
    EditLinesSerializer,
    InquiryRowSerializer,
    InquirySentSerializer,
    InquiryStatusSerializer,
    NoteSerializer,
    OrdersSummarySerializer,
    PaymentActionSerializer,
    PlacedSerializer,
    PlaceOrderSerializer,
    PosOrderSerializer,
    PublicOrderSerializer,
    SendInquirySerializer,
    StaffOrderRowSerializer,
    StaffOrderSerializer,
    SubmitPaymentSerializer,
    TokenSerializer,
    TrackSerializer,
    TransitionSerializer,
)
from apps.orders.services import inquiries, payments, workflow
from apps.orders.services.placing import (
    LineRequest,
    OrderError,
    Place,
    Terms,
    check_place,
    check_terms,
    normalize_phone,
    order_payload,
    place_order,
)
from apps.sync.services.idempotency import KeyConflict, KeyRace, replay
from apps.tenancy import clock

KEY = OpenApiParameter("Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True)


class _Public(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "storefront"


@method_decorator(csrf_protect, name="dispatch")
class PlaceOrderView(_Public):
    """A guest sends the cart as a review request. Same key twice → the same order."""

    throttle_scope = "orders"

    @extend_schema(
        operation_id="public_order_place",
        request=PlaceOrderSerializer,
        parameters=[KEY],
        responses={201: PlacedSerializer},
    )
    def post(self, request: Request) -> Response:
        data = PlaceOrderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        key = idempotency_key(request)
        lines = [LineRequest(li["slug"], li["quantity"]) for li in v["lines"]]
        place = Place(v["address"], v["latitude"], v["longitude"])
        terms = Terms(
            v["fulfillment"], v["payment_method"], v["payment_reference"], v["paid_amount"]
        )
        try:
            result = place_order(
                name=v["name"],
                phone=v["phone"],
                note=v["note"],
                lines=lines,
                place=place,
                terms=terms,
                idempotency_key=key,
            )
        except KeyRace:
            try:
                with transaction.atomic():
                    result = replay(
                        "place_order",
                        key,
                        order_payload(
                            v["name"],
                            normalize_phone(v["phone"]) or "",
                            v["note"],
                            lines,
                            check_place(place),
                            check_terms(terms),
                        ),
                    )
            except KeyConflict:
                return Response(
                    {"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT
                )
        except KeyConflict:
            return Response({"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT)
        except OrderError as exc:
            code = status.HTTP_429_TOO_MANY_REQUESTS if exc.code == "rate_limited" else 400
            return Response(
                {"detail": exc.code, **{k: str(x) for k, x in exc.detail.items()}}, status=code
            )
        return Response(PlacedSerializer(result).data, status=status.HTTP_201_CREATED)


class OrderByKeyView(_Public):
    """After a timeout: did the order with this Idempotency-Key arrive?"""

    @extend_schema(operation_id="public_order_by_key", responses=PlacedSerializer)
    def get(self, request: Request, key: str) -> Response:
        order = Order.objects.filter(idempotency_key=key).first()
        if order is None:
            raise NotFound
        return Response(
            PlacedSerializer(
                {"number": order.number, "token": order.token, "status": order.status}
            ).data
        )


class PublicOrderView(_Public):
    """Opened with the long random token from the WhatsApp link — never by order number."""

    @extend_schema(operation_id="public_order", responses=PublicOrderSerializer)
    def get(self, request: Request, token: str) -> Response:
        order = Order.objects.filter(token=token).first() if len(token) >= 32 else None
        if order is None:
            raise NotFound
        return Response(PublicOrderSerializer(public_order(order)).data)


@method_decorator(csrf_protect, name="dispatch")
class TrackOrderView(_Public):
    """Order number + the phone it was sent with → the order's token."""

    throttle_scope = "track"

    @extend_schema(
        operation_id="public_order_track", request=TrackSerializer, responses=TokenSerializer
    )
    def post(self, request: Request) -> Response:
        data = TrackSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        phone = normalize_phone(data.validated_data["phone"])
        number = data.validated_data["number"].strip().upper()
        order = Order.objects.filter(number=number, phone=phone).first() if phone else None
        if order is None:
            raise NotFound
        return Response(TokenSerializer({"token": order.token}).data)


def _mine(request: Request, pk: uuid.UUID) -> Order:
    order: Order | None = (
        Order.objects.filter(pk=pk, branch=current_branch(request)).select_related("branch").first()
    )
    if order is None:
        raise NotFound
    return order


class StaffOrderListView(APIView):
    permission_classes = [requires("orders.manage")]

    @extend_schema(
        operation_id="orders_list",
        parameters=[
            OpenApiParameter("status", str, required=False),
            OpenApiParameter("q", str, required=False),
            OpenApiParameter("period", str, enum=["today", "week", "all"], required=False),
        ],
        responses=StaffOrderRowSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        p = request.query_params
        qs = (
            Order.objects.filter(branch=current_branch(request))
            .select_related("assigned_to")
            .annotate(n=Count("lines"))
        )
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if term := p.get("q", "").strip():
            qs = qs.filter(
                Q(number__icontains=term)
                | Q(customer_name__icontains=term)
                | Q(phone__contains=term)
            )
        period = p.get("period", "all")
        if period in ("today", "week"):
            tz = timezone.get_current_timezone()
            start = dt.datetime.combine(clock.today(), dt.time.min, tzinfo=tz)
            if period == "week":
                start -= dt.timedelta(days=6)
            qs = qs.filter(created_at__gte=start)
        unread = set(
            Notification.objects.filter(
                kind__in=["order_new", "order_payment"], read_at__isnull=True
            ).values_list("object_id", flat=True)
        )
        rows = [
            {
                "id": o.pk,
                "number": o.number,
                "created_at": o.created_at,
                "customer_name": o.customer_name,
                "phone": o.phone,
                "address": o.address,
                "fulfillment": o.fulfillment,
                "payment_method": o.payment_method,
                "payment_status": o.payment_status,
                "lines_count": o.n,
                "estimated_total": o.estimated_total,
                "status": o.status,
                "assigned_ar": o.assigned_to.display_name_ar if o.assigned_to else None,
                "assigned_en": o.assigned_to.display_name_en if o.assigned_to else None,
                "unread": o.pk in unread,
            }
            for o in qs[:100]
        ]
        return Response(StaffOrderRowSerializer(rows, many=True).data)


class OrdersSummaryView(APIView):
    permission_classes = [requires("orders.manage")]

    @extend_schema(operation_id="orders_summary", responses=OrdersSummarySerializer)
    def get(self, request: Request) -> Response:
        tz = timezone.get_current_timezone()
        start = dt.datetime.combine(clock.today(), dt.time.min, tzinfo=tz)
        today = Order.objects.filter(branch=current_branch(request), created_at__gte=start)
        return Response(
            OrdersSummarySerializer(
                {
                    "unread": unread_orders(),
                    "new": today.filter(status=Order.Status.NEW).count(),
                    "confirmed": today.filter(
                        status__in=[
                            Order.Status.CONFIRMED,
                            Order.Status.PREPARING,
                            Order.Status.READY,
                        ]
                    ).count(),
                    "completed": today.filter(status=Order.Status.COMPLETED).count(),
                }
            ).data
        )


class StaffOrderView(APIView):
    permission_classes = [requires("orders.manage")]

    @extend_schema(operation_id="orders_retrieve", responses=StaffOrderSerializer)
    def get(self, request: Request, pk: uuid.UUID) -> Response:
        return Response(StaffOrderSerializer(staff_order(_mine(request, pk))).data)


class TransitionView(APIView):
    permission_classes = [requires("orders.manage")]

    @extend_schema(
        operation_id="orders_transition",
        request=TransitionSerializer,
        responses=StaffOrderSerializer,
    )
    def post(self, request: Request, pk: uuid.UUID) -> Response:
        order = _mine(request, pk)
        data = TransitionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        try:
            order = workflow.transition(
                order.pk, data.validated_data["to"], data.validated_data["reason"], request.user
            )
        except workflow.WorkflowError as exc:
            raise ValidationError({"detail": exc.code}) from None
        return Response(StaffOrderSerializer(staff_order(order)).data)


class EditLinesView(APIView):
    permission_classes = [requires("orders.manage")]

    @extend_schema(
        operation_id="orders_edit_lines",
        request=EditLinesSerializer,
        responses=StaffOrderSerializer,
    )
    def patch(self, request: Request, pk: uuid.UUID) -> Response:
        order = _mine(request, pk)
        data = EditLinesSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        try:
            order = workflow.edit_lines(
                order.pk,
                data.validated_data["quantities"],
                data.validated_data["consent"],
                request.user,
            )
        except workflow.WorkflowError as exc:
            raise ValidationError({"detail": exc.code}) from None
        return Response(StaffOrderSerializer(staff_order(order)).data)


class NoteView(APIView):
    permission_classes = [requires("orders.manage")]

    @extend_schema(
        operation_id="orders_note", request=NoteSerializer, responses=StaffOrderSerializer
    )
    def patch(self, request: Request, pk: uuid.UUID) -> Response:
        order = _mine(request, pk)
        data = NoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        order = workflow.set_internal_note(
            order.pk, data.validated_data["internal_note"], request.user
        )
        return Response(StaffOrderSerializer(staff_order(order)).data)


class OrderToPosView(APIView):
    """A ready order as a POS cart (its lines, held batches). Only in 'ready'."""

    permission_classes = [requires("pos.sell")]

    @extend_schema(operation_id="orders_pos", responses=PosOrderSerializer)
    def get(self, request: Request, pk: uuid.UUID) -> Response:
        from apps.sales.selectors import pos_items
        from apps.sales.serializers import PosItemSerializer

        order = _mine(request, pk)
        if order.status != Order.Status.READY:
            raise ValidationError({"detail": "order_not_ready"})
        lines = list(order.lines.all())
        rows = {
            r["id"]: r for r in pos_items(order.branch, "", ids=[str(li.item_id) for li in lines])
        }
        return Response(
            PosOrderSerializer(
                {
                    "order": {
                        "id": order.pk,
                        "number": order.number,
                        "customer_name": order.customer_name,
                        "payment_status": order.payment_status,
                        "prepaid": (
                            {"reference": order.payment_reference, "amount": order.paid_amount}
                            if order.payment_status == Order.PaymentStatus.VERIFIED
                            else None
                        ),
                    },
                    "lines": [
                        {
                            "item": PosItemSerializer(rows[li.item_id]).data,
                            "unit_id": li.unit_id,
                            "quantity": li.quantity,
                        }
                        for li in lines
                        if li.item_id in rows
                    ],
                }
            ).data
        )


@method_decorator(csrf_protect, name="dispatch")
class SendInquiryView(_Public):
    """A visitor's question from the contact page. Same key twice → the same inquiry."""

    throttle_scope = "orders"

    @extend_schema(
        operation_id="public_inquiry_send",
        request=SendInquirySerializer,
        parameters=[KEY],
        responses={201: InquirySentSerializer},
    )
    def post(self, request: Request) -> Response:
        data = SendInquirySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        key = idempotency_key(request)
        args: dict[str, Any] = {
            "name": v["name"],
            "phone": v["phone"],
            "topic": v["topic"],
            "via": v["via"],
            "order_number": v["order_number"],
            "message": v["message"],
            "locale": v["locale"],
        }
        try:
            result = inquiries.send_inquiry(**args, idempotency_key=key)
        except KeyRace:
            try:
                with transaction.atomic():
                    result = replay(
                        "send_inquiry",
                        key,
                        inquiries.inquiry_payload(
                            v["name"],
                            normalize_phone(v["phone"]) or "",
                            v["topic"],
                            v["via"],
                            v["order_number"],
                            v["message"],
                            v["locale"],
                        ),
                    )
            except KeyConflict:
                return Response(
                    {"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT
                )
        except KeyConflict:
            return Response({"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT)
        except OrderError as exc:
            code = status.HTTP_429_TOO_MANY_REQUESTS if exc.code == "rate_limited" else 400
            return Response({"detail": exc.code}, status=code)
        return Response(InquirySentSerializer(result).data, status=status.HTTP_201_CREATED)


class StaffInquiryListView(APIView):
    permission_classes = [requires("orders.manage")]

    @extend_schema(
        operation_id="inquiries_list",
        parameters=[
            OpenApiParameter("status", str, required=False),
            OpenApiParameter("q", str, required=False),
        ],
        responses=InquiryRowSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        p = request.query_params
        qs = Inquiry.objects.all()
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if term := p.get("q", "").strip():
            qs = qs.filter(
                Q(number__icontains=term)
                | Q(customer_name__icontains=term)
                | Q(phone__contains=term)
                | Q(order_number__icontains=term)
            )
        unread = set(
            Notification.objects.filter(kind="inquiry_new", read_at__isnull=True).values_list(
                "object_id", flat=True
            )
        )
        rows = list(qs[:100])
        for row in rows:
            row.unread = row.pk in unread
        return Response(InquiryRowSerializer(rows, many=True).data)


class InquiryStatusView(APIView):
    permission_classes = [requires("orders.manage")]

    @extend_schema(
        operation_id="inquiry_status",
        request=InquiryStatusSerializer,
        responses=InquiryRowSerializer,
    )
    def post(self, request: Request, pk: uuid.UUID) -> Response:
        data = InquiryStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        inquiry = Inquiry.objects.filter(pk=pk).first()
        if inquiry is None:
            raise NotFound
        with transaction.atomic():
            assert isinstance(request.user, User)
            inquiries.set_status(inquiry, data.validated_data["status"], request.user)
            mark_read(inquiry.pk)
        inquiry.unread = False
        return Response(InquiryRowSerializer(inquiry).data)


_PAYMENT_ERRORS = {"reference_used": status.HTTP_409_CONFLICT}


@method_decorator(csrf_protect, name="dispatch")
class SubmitPaymentView(_Public):
    """The customer sends the bank transfer's reference and amount for their order."""

    throttle_scope = "orders"

    @extend_schema(
        operation_id="public_order_payment",
        request=SubmitPaymentSerializer,
        responses=PublicOrderSerializer,
    )
    def post(self, request: Request, token: str) -> Response:
        data = SubmitPaymentSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        order = Order.objects.filter(token=token).first() if len(token) >= 32 else None
        if order is None:
            raise NotFound
        try:
            order = payments.submit_payment(
                order.pk, data.validated_data["reference"], data.validated_data["paid_amount"]
            )
        except payments.PaymentError as exc:
            code = _PAYMENT_ERRORS.get(exc.code, status.HTTP_400_BAD_REQUEST)
            return Response({"detail": exc.code}, status=code)
        return Response(PublicOrderSerializer(public_order(order)).data)


class PaymentActionView(APIView):
    """Staff check the transfer against the bank: verify, reject (with a reason), or record the
    refund. Nothing here posts to the ledger."""

    permission_classes = [requires("orders.manage")]

    @extend_schema(
        operation_id="order_payment_action",
        request=PaymentActionSerializer,
        responses=StaffOrderSerializer,
    )
    def post(self, request: Request, pk: uuid.UUID) -> Response:
        data = PaymentActionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        order = _mine(request, pk)
        assert isinstance(request.user, User)
        action = data.validated_data["action"]
        note = data.validated_data["note"]
        try:
            if action == "verify":
                payments.verify(order.pk, request.user)
            elif action == "reject":
                payments.reject(order.pk, request.user, note)
            else:
                payments.mark_refunded(order.pk, request.user, note)
        except payments.PaymentError as exc:
            code = _PAYMENT_ERRORS.get(exc.code, status.HTTP_400_BAD_REQUEST)
            return Response({"detail": exc.code}, status=code)
        order.refresh_from_db()
        return Response(StaffOrderSerializer(staff_order(order)).data)
