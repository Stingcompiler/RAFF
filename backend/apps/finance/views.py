# Views authorize and delegate to services/.
from __future__ import annotations

import uuid

from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import current_branch, idempotency_key, requires
from apps.accounts.models import User
from apps.finance import selectors
from apps.finance.serializers import (
    BankTransferSerializer,
    LedgerRowSerializer,
    PartyPaymentInSerializer,
    PartyPaymentResultSerializer,
    PartySerializer,
    VerifyResultSerializer,
)
from apps.finance.services.payments import (
    PaymentError,
    payment_payload,
    record_payment,
    verify_transfer,
)
from apps.sync.services.idempotency import KeyConflict, KeyRace, replay


def _bad(code: str) -> ValidationError:
    return ValidationError({"detail": code})


class PartyListView(APIView):
    permission_classes = [requires("finance.view")]

    @extend_schema(
        operation_id="finance_parties",
        parameters=[OpenApiParameter("type", str, enum=["customer", "supplier"], required=False)],
        responses=PartySerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        kind = request.query_params.get("type", "customer")
        rows = selectors.suppliers() if kind == "supplier" else selectors.customers()
        return Response(PartySerializer(rows, many=True).data)


class LedgerView(APIView):
    permission_classes = [requires("finance.view")]

    @extend_schema(
        operation_id="finance_ledger",
        parameters=[
            OpenApiParameter("type", str, enum=["customer", "supplier"], required=True),
            OpenApiParameter("party", str, required=True),
        ],
        responses=LedgerRowSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        kind = request.query_params.get("type", "")
        try:
            party = uuid.UUID(request.query_params.get("party", ""))
        except ValueError:
            raise NotFound from None
        known = {
            str(r["id"])
            for r in (selectors.suppliers() if kind == "supplier" else selectors.customers())
        }
        if kind not in ("customer", "supplier") or str(party) not in known:
            raise NotFound
        return Response(LedgerRowSerializer(selectors.ledger(kind, party), many=True).data)


class PaymentView(APIView):
    """Record a collection from a customer or a payment to a supplier."""

    permission_classes = [requires("finance.manage")]

    @extend_schema(
        operation_id="finance_payment",
        request=PartyPaymentInSerializer,
        parameters=[
            OpenApiParameter(
                "Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True
            )
        ],
        responses={201: PartyPaymentResultSerializer},
    )
    def post(self, request: Request) -> Response:
        data = PartyPaymentInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        assert isinstance(request.user, User)
        key = idempotency_key(request)
        try:
            result = record_payment(
                branch=current_branch(request),
                party_type=v["party_type"],
                party_id=v["party_id"],
                method=v["method"],
                amount=v["amount"],
                reference=v["reference"],
                note=v["note"],
                idempotency_key=key,
                user=request.user,
            )
        except KeyRace:
            try:
                with transaction.atomic():
                    result = replay(
                        "party_payment",
                        key,
                        payment_payload(
                            v["party_type"],
                            v["party_id"],
                            v["method"],
                            v["amount"],
                            v["reference"],
                            current_branch(request).pk,
                            v["note"],
                        ),
                    )
            except KeyConflict:
                return Response(
                    {"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT
                )
        except KeyConflict:
            return Response({"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT)
        except PaymentError as exc:
            raise _bad(exc.code) from None
        return Response(PartyPaymentResultSerializer(result).data, status=status.HTTP_201_CREATED)


class BankTransferListView(APIView):
    permission_classes = [requires("finance.view")]

    @extend_schema(
        operation_id="finance_bank_transfers",
        parameters=[OpenApiParameter("status", str, enum=["pending", "all"], required=False)],
        responses=BankTransferSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        from apps.sales.models import Payment

        rows = (
            Payment.objects.filter(method=Payment.Method.BANK, sale__branch=current_branch(request))
            .select_related("sale")
            .order_by("-sale__posted_at")
        )
        if request.query_params.get("status", "pending") == "pending":
            rows = rows.filter(verification=Payment.Verification.PENDING)
        return Response(
            BankTransferSerializer(
                [
                    {
                        "id": p.pk,
                        "sale_number": p.sale.number,
                        "posted_at": p.sale.posted_at,
                        "bank_reference": p.bank_reference,
                        "bank_account": p.bank_account,
                        "amount": p.amount,
                        "verification": p.verification,
                    }
                    for p in rows[:50]
                ],
                many=True,
            ).data
        )


class BankTransferVerifyView(APIView):
    """'Confirm arrival': the transfer reached the bank account."""

    permission_classes = [requires("finance.manage")]

    @extend_schema(
        operation_id="finance_bank_transfer_verify", request=None, responses=VerifyResultSerializer
    )
    def post(self, request: Request, pk: uuid.UUID) -> Response:
        from apps.sales.models import Payment

        if not Payment.objects.filter(pk=pk, sale__branch=current_branch(request)).exists():
            raise NotFound
        assert isinstance(request.user, User)
        try:
            result = verify_transfer(pk, request.user)
        except PaymentError as exc:
            raise _bad(exc.code) from None
        return Response(VerifyResultSerializer(result).data)
