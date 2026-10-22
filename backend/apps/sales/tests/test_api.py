from __future__ import annotations

import uuid
from typing import Any

from rest_framework.test import APIClient

from apps.accounts.tests.test_auth import csrf_client, login
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import stocked


def cashier(world: World) -> tuple[APIClient, dict[str, Any]]:
    client = csrf_client()
    login(client, "salma")
    csrf: dict[str, Any] = {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}
    client.post(
        "/api/v1/auth/context/",
        {"branch_id": str(world.khartoum.pk), "device_id": str(world.counter.pk)},
        format="json",
        **csrf,
    )
    return client, csrf


def test_pos_flow_over_the_api(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=2)
        box = item.units.get(code="box")
    client, csrf = cashier(world)

    assert client.get("/api/v1/shifts/current/").json()["shift"] is None
    opened = client.post("/api/v1/shifts/", {"opening_cash": "50000"}, format="json", **csrf)
    assert opened.status_code == 201, opened.json()

    rows = client.get("/api/v1/pos/items/", {"q": "Item AUG"}).json()
    assert rows[0]["sellable_base"] == 28
    assert rows[0]["unit"]["code"] == "box"

    cart = [{"item_id": str(item.pk), "unit_id": str(box.pk), "quantity": 1}]
    quoted = client.post("/api/v1/sales/quote/", {"lines": cart}, format="json", **csrf).json()
    assert quoted["total"] == "12500.0000"
    assert quoted["lines"][0]["available_base"] == 28

    key = str(uuid.uuid4())
    body = {"lines": cart, "payments": [{"method": "cash", "amount": "12500", "tendered": "20000"}]}
    sold = client.post("/api/v1/sales/", body, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf)
    assert sold.status_code == 201, sold.json()
    assert client.get(f"/api/v1/sales/by-key/{key}/").json()["number"] == sold.json()["number"]
    assert client.get(f"/api/v1/sales/by-key/{uuid.uuid4()}/").status_code == 404

    body["lines"] = [{**cart[0], "quantity": 2}]
    reused = client.post("/api/v1/sales/", body, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf)
    assert reused.status_code == 409

    receipt = client.post(f"/api/v1/sales/{sold.json()['id']}/print/?reprint=1", **csrf).json()
    assert receipt["locale"] == "ar"
    assert receipt["total"] == "12,500 ج.س"
    assert [p["label"] for p in receipt["payments"]] == ["نقدي", "الباقي"]

    held = client.post("/api/v1/sales/held/", {"lines": cart}, format="json", **csrf).json()
    assert len(client.get("/api/v1/sales/held/").json()) == 1
    resumed = client.post(f"/api/v1/sales/held/{held['id']}/resume/", **csrf).json()
    assert resumed["cart"][0]["quantity"] == 1
    assert client.get("/api/v1/sales/held/").json() == []

    summary = client.get("/api/v1/shifts/current/").json()
    assert summary["expected_cash"] == "62500.0000"


def test_selling_needs_a_counter(world: World) -> None:
    client = csrf_client()
    login(client, "owner")
    response = client.post(
        "/api/v1/sales/",
        {"lines": [], "payments": []},
        format="json",
        HTTP_IDEMPOTENCY_KEY="k",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    assert response.status_code in (400, 403)
