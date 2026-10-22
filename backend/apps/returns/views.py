# Views authorize and delegate to services/.
from __future__ import annotations

from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import current_branch, current_device, idempotency_key, requires
from apps.accounts.models import User
from apps.inventory.services.stock import InsufficientStock
from apps.returns.models import SaleReturn
from apps.returns.selectors import returnable_sale
from apps.returns.serializers import (
    ReturnableSaleSerializer,
    ReturnInSerializer,
    ReturnListSerializer,
    ReturnResultSerializer,
)
from apps.returns.services.posting import (
    ReturnError,
    ReturnLineRequest,
    post_return,
    return_payload,
)
from apps.sales.models import Sale
from apps.sync.services.idempotency import KeyConflict, KeyMissing, KeyRace, replay


def _bad(code: str, **detail: object) -> ValidationError:
    return ValidationError({"detail": code, **{k: str(v) for k, v in detail.items()}})


class ReturnLookupView(APIView):
    """Find a sale of this branch by its invoice number, with what can still be returned."""

    permission_classes = [requires("returns.create")]

    @extend_schema(
        operation_id="returns_lookup",
        parameters=[OpenApiParameter("number", str, required=True)],
        responses=ReturnableSaleSerializer,
    )
    def get(self, request: Request) -> Response:
        number = request.query_params.get("number", "").strip().upper()
        sale = (
            Sale.objects.filter(number=number, branch=current_branch(request))
            .select_related("customer")
            .first()
        )
        if sale is None:
            raise NotFound
        return Response(ReturnableSaleSerializer(returnable_sale(sale)).data)


class ReturnListView(APIView):
    permission_classes = [requires("returns.create")]

    @extend_schema(operation_id="returns_list", responses=ReturnListSerializer(many=True))
    def get(self, request: Request) -> Response:
        rows = SaleReturn.objects.filter(branch=current_branch(request)).select_related("sale")[:30]
        return Response(ReturnListSerializer(rows, many=True).data)

    @extend_schema(
        operation_id="returns_post",
        request=ReturnInSerializer,
        parameters=[
            OpenApiParameter(
                "Idempotency-Key", str, location=OpenApiParameter.HEADER, required=True
            )
        ],
        responses={201: ReturnResultSerializer},
    )
    def post(self, request: Request) -> Response:
        data = ReturnInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        device = current_device(request)
        key = idempotency_key(request)
        assert isinstance(request.user, User)
        lines = [ReturnLineRequest(**line) for line in v["lines"]]
        if not Sale.objects.filter(pk=v["sale_id"], branch=device.branch).exists():
            raise NotFound
        try:
            result = post_return(
                sale_id=v["sale_id"],
                device=device,
                refund=v["refund_method"],
                lines=lines,
                idempotency_key=key,
                user=request.user,
            )
        except KeyRace:
            try:
                with transaction.atomic():
                    result = replay(
                        "post_return", key, return_payload(v["sale_id"], v["refund_method"], lines)
                    )
            except KeyConflict:
                return Response(
                    {"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT
                )
        except KeyConflict:
            return Response({"detail": "idempotency_key_reused"}, status=status.HTTP_409_CONFLICT)
        except KeyMissing:
            raise _bad("idempotency_key_required") from None
        except ReturnError as exc:
            raise _bad(exc.code, **exc.detail) from None
        except InsufficientStock:
            raise _bad("insufficient_stock") from None
        return Response(ReturnResultSerializer(result).data, status=status.HTTP_201_CREATED)
