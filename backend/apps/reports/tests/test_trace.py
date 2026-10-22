"""Every report total traces back to its documents (WO-07 acceptance)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from django.db.models import Sum
from rest_framework.test import APIClient

from apps.accounts.tests.test_auth import csrf_client, login
from apps.finance.models import JournalLine
from apps.inventory.models import StockBalance, StockMovement
from apps.reports.services.catalog import Params, expiry, gross_profit, shortages, stock_value
from apps.reports.services.dashboard import overview
from apps.returns.models import SaleReturn
from apps.returns.tests.helpers import give_back, sell
from apps.sales.models import Sale
from apps.sales.services.posting import PaymentRequest
from apps.sales.tests.test_api import cashier
from apps.tenancy import clock
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import stocked, with_shift

pytestmark = pytest.mark.django_db


def params(world: World, days: int = 90) -> Params:
    today = clock.today()
    return Params(world.khartoum, today - dt.timedelta(days=30), today, days)


def test_gross_profit_equals_documents_and_the_ledger(world: World) -> None:
    with org_context(world.org.id):
        a = stocked(world, code="A", boxes=5)
        b = stocked(world, code="B", boxes=5, price="8000")
        with_shift(world)
        sale = sell(world, a, boxes=3)
        sell(world, b, boxes=2, payments=[PaymentRequest("cash", Decimal("16000"))])
        give_back(world, sale, 1)

        report = gross_profit(params(world))
        sales = Sale.objects.aggregate(t=Sum("total"), c=Sum("cost_total"))
        returns = SaleReturn.objects.aggregate(t=Sum("total"), c=Sum("cost_total"))
        assert report.totals["revenue"] == sales["t"] - returns["t"]
        assert report.totals["cost"] == sales["c"] - returns["c"]
        income = JournalLine.objects.filter(account__code="4000").aggregate(
            c=Sum("credit"), d=Sum("debit")
        )
        assert report.totals["revenue"] == income["c"] - income["d"]
        cogs = JournalLine.objects.filter(account__code="5000").aggregate(
            c=Sum("credit"), d=Sum("debit")
        )
        assert report.totals["cost"] == cogs["d"] - cogs["c"]
        assert sum(r["revenue"] for r in report.rows) == report.totals["revenue"]


def test_stock_value_equals_the_movement_log(world: World) -> None:
    with org_context(world.org.id):
        a = stocked(world, code="A", boxes=5)
        with_shift(world)
        sell(world, a, boxes=2)
        report = stock_value(params(world))
        moved = sum(
            m.quantity_base * m.unit_cost
            for m in StockMovement.objects.filter(branch=world.khartoum)
        )
        assert report.totals["value"] == moved
        on_hand = sum(StockBalance.objects.values_list("quantity_base", flat=True))
        assert report.rows[0]["sellable"] == Decimal(on_hand) / 14


def test_expiry_shortages_and_overview(world: World) -> None:
    with org_context(world.org.id):
        soon = clock.today() + dt.timedelta(days=30)
        stocked(world, code="S", boxes=1, expiry=soon)
        stocked(world, code="L", boxes=1)
        rows = expiry(params(world)).rows
        assert [r["batch"] for r in rows] == ["B-1"] and rows[0]["expiry"] == soon
        short = {r["code"] for r in shortages(params(world)).rows}
        assert short == {"S", "L"}  # 14 tablets is under the reorder level of 20
        data = overview([world.khartoum])
        assert data["needs_action"]["expiring"] == 1
        assert data["needs_action"]["below_reorder"] == 2
        assert len(data["week"]) == 7


def owner_client(world: World) -> APIClient:
    client = csrf_client()
    login(client, "owner")
    client.post(
        "/api/v1/auth/context/",
        {"branch_id": str(world.khartoum.pk), "device_id": None},
        format="json",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    return client


def test_reports_api_csv_and_permissions(world: World) -> None:
    with org_context(world.org.id):
        stocked(world, code="A", boxes=2)
    client = owner_client(world)
    data = client.get("/api/v1/reports/stock_value/").json()
    assert data["columns"][0]["key"] == "code" and data["rows"][0]["code"] == "A"
    csv = client.get("/api/v1/reports/stock_value/", {"export": "csv", "lang": "en"})
    assert csv["Content-Type"].startswith("text/csv")
    assert csv.content.decode("utf-8").startswith("﻿Code,Item")
    assert client.get("/api/v1/reports/nope/").status_code == 404
    assert client.get("/api/v1/dashboard/", {"scope": "all"}).status_code == 200
    assert client.get("/api/v1/audit/events/").status_code == 200
    teller, _ = cashier(world)
    assert teller.get("/api/v1/reports/stock_value/").status_code == 403
    assert teller.get("/api/v1/audit/events/").status_code == 403
    assert teller.get("/api/v1/finance/parties/").status_code == 403
