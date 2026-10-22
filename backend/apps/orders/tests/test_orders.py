from __future__ import annotations

import uuid
from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.accounts.tests.test_auth import csrf_client
from apps.notifications.models import Notification
from apps.orders.models import Order
from apps.orders.services.workflow import WorkflowError, edit_lines, transition
from apps.returns.tests.test_api import owner_at
from apps.tenancy.context import org_context
from tests.factories import World
from tests.storefront import open_store, stocked_listing

pytestmark = pytest.mark.django_db


def guest() -> tuple[APIClient, dict[str, Any]]:
    client = csrf_client()
    return client, {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}


def body(slug: str, qty: int = 2, phone: str = "0912345678") -> dict[str, Any]:
    return {
        "name": "سلمى أحمد",
        "phone": phone,
        "note": "",
        "agree": True,
        "lines": [{"slug": slug, "quantity": qty}],
    }


def test_guest_order_is_idempotent_and_tracked_by_token(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        listing = stocked_listing(world)
    client, csrf = guest()
    key = str(uuid.uuid4())
    first = client.post(
        "/api/v1/public/orders/",
        body(listing.slug),
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
        **csrf,
    )
    assert first.status_code == 201, first.json()
    again = client.post(
        "/api/v1/public/orders/",
        body(listing.slug),
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
        **csrf,
    )
    assert again.json() == first.json()
    changed = client.post(
        "/api/v1/public/orders/",
        body(listing.slug, 3),
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
        **csrf,
    )
    assert changed.status_code == 409
    placed = first.json()
    assert placed["number"] == "O-0001" and len(placed["token"]) >= 40

    with org_context(world.org.id):
        assert Order.objects.count() == 1
        order = Order.objects.get()
        assert order.estimated_total == 25000 and order.phone == "0912345678"
        assert Notification.objects.filter(kind="order_new").count() == 1

    view = client.get(f"/api/v1/public/orders/{placed['token']}/").json()
    assert view["status"] == "new" and view["lines"][0]["quantity"] == 2
    # The order number alone opens nothing; number + the right phone gives the token.
    assert client.get(f"/api/v1/public/orders/{placed['number']}/").status_code == 404
    tracked = client.post(
        "/api/v1/public/orders/track/",
        {"number": "o-0001", "phone": "+249912345678"},
        format="json",
        **csrf,
    )
    assert tracked.json()["token"] == placed["token"]
    wrong = client.post(
        "/api/v1/public/orders/track/",
        {"number": "O-0001", "phone": "0999999999"},
        format="json",
        **csrf,
    )
    assert wrong.status_code == 404
    assert client.get(f"/api/v1/public/orders/by-key/{key}/").json()["token"] == placed["token"]


def test_bad_orders_are_refused(world: World) -> None:
    with org_context(world.org.id):
        store = open_store(world)
        listing = stocked_listing(world)
        store.orders_per_hour = 1
        store.save()
    client, csrf = guest()

    def post(data: dict[str, Any]) -> Any:
        return client.post(
            "/api/v1/public/orders/",
            data,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            **csrf,
        )

    assert post(body(listing.slug, phone="12345")).json()["detail"] == "invalid_phone"
    assert post(body("nope")).json()["detail"] == "unknown_item"
    assert post({**body(listing.slug), "agree": False}).status_code == 400
    assert post(body(listing.slug)).status_code == 201
    assert post(body(listing.slug)).status_code == 429  # one order per hour for this phone
    no_csrf = APIClient(enforce_csrf_checks=True)
    assert (
        no_csrf.post(
            "/api/v1/public/orders/", body(listing.slug), format="json", HTTP_IDEMPOTENCY_KEY="k"
        ).status_code
        == 403
    )


def test_staff_workflow_never_completes_by_hand(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        listing = stocked_listing(world)
    client, csrf = guest()
    client.post(
        "/api/v1/public/orders/",
        body(listing.slug),
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        **csrf,
    )
    with org_context(world.org.id):
        order = Order.objects.get()
        with pytest.raises(WorkflowError):
            transition(order.pk, "completed", "", world.owner)
        with pytest.raises(WorkflowError) as exc:
            transition(order.pk, "needs_contact", "", world.owner)
        assert exc.value.code == "reason_required"
        transition(order.pk, "needs_contact", "price changed", world.owner)
        with pytest.raises(WorkflowError):
            edit_lines(order.pk, {str(order.lines.get().pk): 1}, "", world.owner)
        edit_lines(
            order.pk, {str(order.lines.get().pk): 1}, "customer agreed on WhatsApp", world.owner
        )
        order.refresh_from_db()
        assert order.estimated_total == 12500
        for step in ("confirmed", "preparing", "ready"):
            transition(order.pk, step, "", world.owner)
        with pytest.raises(WorkflowError):
            transition(order.pk, "completed", "", world.owner)

    staff, _ = owner_at(world, world.khartoum.pk)
    detail = staff.get(f"/api/v1/orders/{order.pk}/").json()
    assert detail["status"] == "ready" and detail["allowed"] == ["cancelled"]
    assert detail["lines"][0]["available_units"] == 3
    assert [e["status"] for e in detail["events"]][:2] == ["new", "needs_contact"]
    public = client.get(f"/api/v1/public/orders/{order.token}/").json()
    assert "internal_note" not in public and all("actor_ar" not in e for e in public["events"])
    other, _ = owner_at(world, world.omdurman.pk)
    assert other.get(f"/api/v1/orders/{order.pk}/").status_code == 404
