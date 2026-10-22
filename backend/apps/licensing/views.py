# Views authorize and delegate to services/.
from __future__ import annotations

from dataclasses import asdict

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.licensing.services.license import current_license


class LicenseStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="licensing_status",
        responses=inline_serializer(
            "LicenseStatus",
            {
                "state": serializers.ChoiceField(["valid", "missing", "invalid"]),
                "organization": serializers.CharField(allow_null=True),
                "branches": serializers.IntegerField(allow_null=True),
                "issued": serializers.CharField(allow_null=True),
            },
        ),
    )
    def get(self, request: Request) -> Response:
        return Response(asdict(current_license()))
