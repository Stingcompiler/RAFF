# Views authorize and delegate to services/.
from __future__ import annotations

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import requires
from apps.accounts.serializers import DeviceSerializer
from apps.tenancy.models import Branch, Device
from apps.tenancy.serializers import DeviceCreateSerializer
from apps.tenancy.services.devices import create_device, register_device

DEVICE_COOKIE_MAX_AGE = 5 * 365 * 24 * 60 * 60


class DeviceListView(APIView):
    permission_classes = [requires("settings.manage")]

    @extend_schema(operation_id="devices_list", responses=DeviceSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(DeviceSerializer(Device.objects.all(), many=True).data)

    @extend_schema(
        operation_id="devices_create",
        request=DeviceCreateSerializer,
        responses={201: DeviceSerializer},
    )
    def post(self, request: Request) -> Response:
        data = DeviceCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        branch = Branch.objects.filter(pk=data.validated_data["branch_id"]).first()
        if branch is None:
            raise ValidationError({"branch_id": "unknown"})
        device = create_device(
            branch, data.validated_data["name_ar"], data.validated_data["name_en"]
        )
        return Response(DeviceSerializer(device).data, status=status.HTTP_201_CREATED)


class DeviceRegisterView(APIView):
    """Register the calling browser as this counter (sets the HttpOnly device cookie)."""

    permission_classes = [requires("settings.manage")]

    @extend_schema(operation_id="devices_register", request=None, responses=DeviceSerializer)
    def post(self, request: Request, pk: str) -> Response:
        device = Device.objects.filter(pk=pk, is_active=True).first()
        if device is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        token = register_device(device)
        response = Response(DeviceSerializer(device).data)
        response.set_cookie(
            settings.DEVICE_COOKIE_NAME,
            token,
            max_age=DEVICE_COOKIE_MAX_AGE,
            httponly=True,
            secure=settings.SESSION_COOKIE_SECURE,
            samesite="Lax",
        )
        return response
