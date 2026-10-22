from __future__ import annotations

import uuid
from typing import Any

from rest_framework.test import APIClient

from apps.accounts.tests.test_auth import csrf_client, login
from apps.inventory.models import QuarantineEntry
from apps.sales.tests.test_api import cashier
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import stocked, with_shift

from .helpers import sell


def owner_at(world: World, branch_id: object) -> tuple[APIClient, dict[str, Any]]:
    client = csrf_client()
    login(client, "owner")
    csrf: dict[str, Any] = {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}
    client.post(
        "/api/v1/auth/context/",
        {"branch_id": str(branch_id), "device_id": None},
        format="json",
        **csrf,
    )
    return client, csrf


def test_return_quarantine_and_stocktake_over_the_api(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)
        with_shift(world)
        sale = sell(world, item, boxes=2)
    client, csrf = cashier(world)

    found = client.get("/api/v1/returns/lookup/", {"number": sale.number.lower()}).json()
    assert found["default_refund"] == "cash"
    line = found["lines"][0]
    assert (line["quantity"], line["returnable"]) == (2, 2)
    body = {
        "sale_id": found["id"],
        "refund_method": "cash",
        "lines": [
            {"sale_line_id": line["id"], "quantity": 3, "reason": "damaged", "condition": "sealed"}
        ],
    }
    too_many = client.post(
        "/api/v1/returns/", body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **csrf
    )
    assert too_many.status_code == 400 and too_many.json()["detail"] == "exceeds_sold"
    body["lines"][0]["quantity"] = 1
    quoted = client.post(
        "/api/v1/returns/quote/",
        {"sale_id": body["sale_id"], "lines": body["lines"]},
        format="json",
        **csrf,
    ).json()
    assert quoted["total"] == "12500.0000"
    key = str(uuid.uuid4())
    posted = client.post("/api/v1/returns/", body, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf)
    assert posted.status_code == 201, posted.json()
    again = client.post("/api/v1/returns/", body, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf)
    assert again.json() == posted.json()
    body["lines"][0]["reason"] = "expired"
    reused = client.post("/api/v1/returns/", body, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf)
    assert reused.status_code == 409

    pending = client.get("/api/v1/quarantine/").json()
    assert len(pending) == 1 and pending[0]["status"] == "pending"
    assert pending[0]["unit"]["factor"] == 14 and pending[0]["quantity_base"] == 14
    entry = pending[0]["id"]
    # The cashier may not decide; the responsible pharmacist (here the owner) may.
    denied = client.post(
        f"/api/v1/quarantine/{entry}/decide/",
        {"decision": "restock"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        **csrf,
    )
    assert denied.status_code == 403
    owner, ocsrf = owner_at(world, world.khartoum.pk)
    decided = owner.post(
        f"/api/v1/quarantine/{entry}/decide/",
        {"decision": "restock", "note": "sealed"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        **ocsrf,
    )
    assert decided.status_code == 200 and decided.json()["status"] == "restocked"

    take = owner.post("/api/v1/stocktakes/", {}, format="json", **ocsrf).json()
    row = next(r for r in take["lines"] if r["code"] == item.code)
    assert row["system_base"] == 28 and row["factor"] == 14
    counted = owner.patch(
        f"/api/v1/stocktakes/{take['id']}/",
        {"lines": [{"line_id": row["id"], "counted_units": 2}]},
        format="json",
        **ocsrf,
    ).json()
    assert counted["counted"] == 1
    approved = owner.post(
        f"/api/v1/stocktakes/{take['id']}/approve/",
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        **ocsrf,
    )
    assert approved.status_code == 200 and approved.json()["adjusted_items"] == 0
    with org_context(world.org.id):
        assert QuarantineEntry.objects.filter(status="pending").count() == 0


def test_other_branch_sees_nothing(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=2)
        with_shift(world)
        sale = sell(world, item, boxes=1)
    owner, ocsrf = owner_at(world, world.omdurman.pk)
    assert owner.get("/api/v1/returns/lookup/", {"number": sale.number}).status_code == 404
    take = owner.post("/api/v1/stocktakes/", {}, format="json", **ocsrf).json()
    krt, _ = owner_at(world, world.khartoum.pk)
    assert krt.get(f"/api/v1/stocktakes/{take['id']}/").status_code == 404
