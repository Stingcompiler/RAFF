# Views authorize and delegate to services/.
from __future__ import annotations

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import requires
from apps.audit.models import AuditEvent
from apps.audit.serializers import AuditEventSerializer


class AuditEventListView(APIView):
    """Who did what, newest first (append-only)."""

    permission_classes = [requires("settings.manage")]

    @extend_schema(
        operation_id="audit_events",
        parameters=[
            OpenApiParameter("object_type", str, required=False),
            OpenApiParameter("action", str, required=False),
            OpenApiParameter("limit", int, required=False),
        ],
        responses=AuditEventSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        rows = AuditEvent.objects.select_related("actor", "branch").order_by("-created_at")
        if kind := request.query_params.get("object_type"):
            rows = rows.filter(object_type=kind)
        if action := request.query_params.get("action"):
            rows = rows.filter(action=action)
        try:
            limit = max(1, min(int(request.query_params.get("limit", 100)), 500))
        except ValueError:
            limit = 100
        return Response(AuditEventSerializer(rows[:limit], many=True).data)
