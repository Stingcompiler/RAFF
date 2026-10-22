# Views authorize and delegate to services/.
from __future__ import annotations

import csv
import datetime as dt
import io
from dataclasses import asdict
from typing import Any

from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import current_branch, requires
from apps.accounts.models import User
from apps.reports.serializers import OverviewSerializer, ReportSerializer
from apps.reports.services.catalog import DEFAULT_DAYS, REPORTS, Params
from apps.reports.services.dashboard import overview
from apps.tenancy import clock


def _date(value: str | None, default: dt.date) -> dt.date:
    if not value:
        return default
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        raise ValidationError({"detail": "invalid_date"}) from None


class ReportView(APIView):
    """One of the seven reports as JSON, or as CSV (UTF-8 with BOM) with ?format=csv."""

    permission_classes = [requires("reports.view")]

    @extend_schema(
        operation_id="reports_run",
        parameters=[
            OpenApiParameter("from", str, required=False, description="YYYY-MM-DD"),
            OpenApiParameter("to", str, required=False, description="YYYY-MM-DD"),
            OpenApiParameter("days", int, required=False),
            OpenApiParameter("export", str, enum=["csv"], required=False),
            OpenApiParameter("lang", str, enum=["ar", "en"], required=False),
        ],
        responses={(200, "application/json"): ReportSerializer, (200, "text/csv"): str},
    )
    def get(self, request: Request, name: str) -> Response | HttpResponse:
        build = REPORTS.get(name)
        if build is None:
            raise NotFound
        today = clock.today()
        end = _date(request.query_params.get("to"), today)
        start = _date(request.query_params.get("from"), end - dt.timedelta(days=29))
        if start > end:
            raise ValidationError({"detail": "invalid_period"})
        try:
            days = int(request.query_params.get("days", DEFAULT_DAYS.get(name, 30)))
        except ValueError:
            raise ValidationError({"detail": "invalid_days"}) from None
        report = build(Params(current_branch(request), start, end, max(1, min(days, 3650))))
        if request.query_params.get("export") == "csv":
            return _csv(report, ar=request.query_params.get("lang", "ar") == "ar")
        return Response(
            ReportSerializer(
                {
                    "name": report.name,
                    "start": start,
                    "end": end,
                    "days": days,
                    "columns": [asdict(c) for c in report.columns],
                    "rows": report.rows,
                    "totals": report.totals,
                }
            ).data
        )


def _cell(row: dict[str, Any], key: str, ar: bool) -> str:
    value = row.get(key) if ar else row.get(f"{key}_en", row.get(key))
    return "" if value is None else str(value)


def _csv(report: Any, *, ar: bool) -> HttpResponse:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([c.label_ar if ar else c.label_en for c in report.columns])
    for row in report.rows:
        writer.writerow([_cell(row, c.key, ar) for c in report.columns])
    response = HttpResponse("﻿" + out.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{report.name}.csv"'
    return response


class OverviewView(APIView):
    """Dashboard figures for the session's branch, or every branch the user may see."""

    permission_classes = [requires("reports.view")]

    @extend_schema(
        operation_id="dashboard",
        parameters=[OpenApiParameter("scope", str, enum=["branch", "all"], required=False)],
        responses=OverviewSerializer,
    )
    def get(self, request: Request) -> Response:
        assert isinstance(request.user, User)
        if request.query_params.get("scope") == "all":
            branches = list(request.user.branches())
        else:
            branches = [current_branch(request)]
        return Response(OverviewSerializer(overview(branches)).data)
