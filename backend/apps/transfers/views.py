# Views authorize and delegate to services/.
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import current_branch, idempotency_key, requires
from apps.accounts.models import User
from apps.inventory.services.stock import InsufficientStock
from apps.sync.services.idempotency import KeyConflict, KeyRace, replay
from apps.tenancy.models import Branch
from apps.transfers.models import Transfer
from apps.transfers.selectors import transfer_row
from apps.transfers.serializers import (
    ReceiveInSerializer,
    TransferDetailSerializer,
    TransferInSerializer,
    TransferSerializer,
)
from apps.transfers.services import moving

KEY = OpenApiParameter("Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True)


def _bad(code: str) -> ValidationError:
    return ValidationError({"detail": code})


def _conflict() -> Response:
    return Response({"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT)


def _mine(request: Request, pk: str) -> Transfer:
    branch = current_branch(request)
    t: Transfer | None = (
        Transfer.objects.filter(Q(from_branch=branch) | Q(to_branch=branch), pk=pk)
        .select_related("from_branch", "to_branch")
        .first()
    )
    if t is None:
        raise NotFound
    return t


class TransferListView(APIView):
    permission_classes = [requires("transfers.manage")]

    @extend_schema(operation_id="transfers_list", responses=TransferSerializer(many=True))
    def get(self, request: Request) -> Response:
        branch = current_branch(request)
        rows = Transfer.objects.filter(Q(from_branch=branch) | Q(to_branch=branch)).select_related(
            "from_branch", "to_branch"
        )[:50]
        return Response(
            TransferSerializer([transfer_row(t, with_lines=False) for t in rows], many=True).data
        )

    @extend_schema(
        operation_id="transfers_create",
        request=TransferInSerializer,
        responses={201: TransferDetailSerializer},
    )
    def post(self, request: Request) -> Response:
        data = TransferInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        to = Branch.objects.filter(pk=data.validated_data["to_branch_id"], is_active=True).first()
        if to is None:
            raise _bad("unknown_branch")
        assert isinstance(request.user, User)
        try:
            t = moving.save_draft(
                transfer=None,
                from_branch=current_branch(request),
                to_branch=to,
                lines=moving.in_sale_units(data.validated_data["lines"]),
                note=data.validated_data["note"],
                user=request.user,
            )
        except moving.TransferError as exc:
            raise _bad(exc.code) from None
        t = Transfer.objects.select_related("from_branch", "to_branch").get(pk=t.pk)
        return Response(
            TransferDetailSerializer(transfer_row(t, with_lines=True)).data,
            status=status.HTTP_201_CREATED,
        )


class TransferDetailView(APIView):
    permission_classes = [requires("transfers.manage")]

    @extend_schema(operation_id="transfers_retrieve", responses=TransferDetailSerializer)
    def get(self, request: Request, pk: str) -> Response:
        return Response(
            TransferDetailSerializer(transfer_row(_mine(request, pk), with_lines=True)).data
        )


class TransferSendView(APIView):
    permission_classes = [requires("transfers.manage")]

    @extend_schema(
        operation_id="transfers_send",
        request=None,
        parameters=[KEY],
        responses=TransferDetailSerializer,
    )
    def post(self, request: Request, pk: str) -> Response:
        t = _mine(request, pk)
        if t.from_branch_id != current_branch(request).pk:
            raise NotFound
        assert isinstance(request.user, User)
        key = idempotency_key(request)
        try:
            moving.send(t.pk, idempotency_key=key, user=request.user)
        except KeyRace:
            try:
                with transaction.atomic():
                    replay("transfer_send", key, {"transfer": str(t.pk)})
            except KeyConflict:
                return _conflict()
        except KeyConflict:
            return _conflict()
        except moving.TransferError as exc:
            raise _bad(exc.code) from None
        except InsufficientStock:
            raise _bad("insufficient_stock") from None
        t.refresh_from_db()
        return Response(TransferDetailSerializer(transfer_row(t, with_lines=True)).data)


class TransferReceiveView(APIView):
    permission_classes = [requires("transfers.manage")]

    @extend_schema(
        operation_id="transfers_receive",
        request=ReceiveInSerializer,
        parameters=[KEY],
        responses=TransferDetailSerializer,
    )
    def post(self, request: Request, pk: str) -> Response:
        t = _mine(request, pk)
        if t.to_branch_id != current_branch(request).pk:
            raise NotFound
        data = ReceiveInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        factors = {str(li["id"]): li["factor"] for li in transfer_row(t, with_lines=True)["lines"]}
        received: dict[str, Any] = {
            str(li["line_id"]): li["received"] * factors.get(str(li["line_id"]), 1)
            for li in data.validated_data["lines"]
        }
        assert isinstance(request.user, User)
        key = idempotency_key(request)
        try:
            moving.receive(t.pk, received, idempotency_key=key, user=request.user)
        except KeyRace:
            try:
                with transaction.atomic():
                    replay(
                        "transfer_receive",
                        key,
                        {"transfer": str(t.pk), "received": sorted(received.items())},
                    )
            except KeyConflict:
                return _conflict()
        except KeyConflict:
            return _conflict()
        except moving.TransferError as exc:
            raise _bad(exc.code) from None
        t.refresh_from_db()
        return Response(TransferDetailSerializer(transfer_row(t, with_lines=True)).data)
