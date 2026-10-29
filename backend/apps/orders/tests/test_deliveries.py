"""WO-31 acceptance: a courier delivers a ready order; the sale is posted at settlement."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.accounts.tests.test_auth import csrf_client, login
from apps.orders.models import Order
from apps.orders.services.workflow import WorkflowError, transition
from apps.returns.tests.test_api import owner_at
from apps.sales.models import Sale
from apps.sales.services.posting import PaymentRequest, SaleError, post_sale
from apps.tenancy.context import org_context
from tests.factories import World, make_user
from tests.selling import line, with_shift
from tests.storefront import open_store, stocked_listing

from .test_inquiries import guest
from .test_payments import bank, place, prepay_open

pytestmark = pytest.mark.django_db

TOTAL = Decimal("12500")


def courier_client(
    world: World, username: str = "hasan", branch: Any = None
) -> tuple[APIClient, dict[str, Any]]:
    with org_context(world.org.id):
        make_user(username, "courier", world.khartoum)
    client = csrf_client()
    login(client, username)
    csrf: dict[str, Any] = {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}
    client.post(
        "/api/v1/auth/context/",
        {"branch_id": str((branch or world.khartoum).pk), "device_id": None},
        format="json",
        **csrf,
    )
    return client, csrf


def delivery_order(world: World, **extra: Any) -> tuple[Any, Any, Order, Any]:
    with org_context(world.org.id):
        store = open_store(world)
        store.delivery_enabled = True
        store.orders_per_hour = 50
        store.save()
        listing = stocked_listing(world, boxes=3)
        with_shift(world)
    client, csrf = guest()
    placed = place(client, csrf, listing.slug, fulfillment="delivery", **extra)
    assert placed.status_code == 201, placed.json()
    with org_context(world.org.id):
        order = Order.objects.get()
        transition(order.pk, "confirmed", "", world.owner)
        if order.payment_method == "cod":
            transition(order.pk, "preparing", "", world.owner)
            transition(order.pk, "ready", "", world.owner)
    return client, csrf, order, listing


def test_a_courier_takes_an_assigned_order_and_reports_it_delivered(world: World) -> None:
    _, _, order, listing = delivery_order(world)
    staff, scsrf = owner_at(world, world.khartoum.pk)
    courier, ccsrf = courier_client(world)
    with org_context(world.org.id):
        hasan = make_user("other", "courier", world.khartoum)
    cid = staff.get("/api/v1/couriers/").json()
    # The owner holds every permission, so can also deliver; the couriers are listed too.
    assert {"hasan", "other"} <= {c["username"] for c in cid}
    assert courier.get("/api/v1/deliveries/").json() == []  # nothing assigned yet
    assign = f"/api/v1/orders/{order.pk}/assign-courier/"
    bad = staff.post(assign, {"courier_id": str(uuid.uuid4())}, format="json", **scsrf)
    assert bad.json()["detail"] == "unknown_courier"
    mine = next(c["id"] for c in cid if c["username"] == "hasan")
    done = staff.post(assign, {"courier_id": mine}, format="json", **scsrf)
    assert done.status_code == 200 and done.json()["courier_name_en"] == "hasan"
    assert hasan.pk != done.json()["courier_id"]

    cards = courier.get("/api/v1/deliveries/").json()
    assert len(cards) == 1 and cards[0]["amount_due"] == "12500.0000"
    assert cards[0]["address"] and cards[0]["status"] == "ready"
    step = f"/api/v1/deliveries/{order.pk}"
    assert (
        courier.post(f"{step}/deliver/", {"collected": "12500"}, format="json", **ccsrf).status_code
        == 400
    )
    assert (
        courier.post(f"{step}/pickup/", {}, format="json", **ccsrf).json()["status"]
        == "out_for_delivery"
    )
    assert courier.post(f"{step}/pickup/", {}, format="json", **ccsrf).status_code == 400
    no_cash = courier.post(f"{step}/deliver/", {}, format="json", **ccsrf)
    assert no_cash.json()["detail"] == "collected_required"
    ok = courier.post(f"{step}/deliver/", {"collected": "12500"}, format="json", **ccsrf)
    assert ok.json()["status"] == "delivered" and ok.json()["collected_amount"] == "12500.0000"
    with org_context(world.org.id):
        order.refresh_from_db()
        assert order.delivered_at is not None
        # Stock stays reserved until the sale is posted at the counter.
        assert order.reservations.filter(status="active").exists()
        with pytest.raises(WorkflowError):
            transition(
                order.pk, "cancelled", "late", world.owner
            )  # delivered orders are not cancelled
        post_sale(
            device=world.counter,
            user=world.cashier,
            lines=[line(listing.item)],
            payments=[PaymentRequest("cash", TOTAL, tendered=TOTAL)],
            customer_id=None,
            can_discount=False,
            idempotency_key=str(uuid.uuid4()),
            order_id=order.pk,
        )
        order.refresh_from_db()
        assert order.status == "completed" and Sale.objects.count() == 1


def test_the_pos_takes_a_delivery_only_after_it_was_delivered(world: World) -> None:
    _, _, order, listing = delivery_order(world)

    def sell() -> None:
        post_sale(
            device=world.counter,
            user=world.cashier,
            lines=[line(listing.item)],
            payments=[PaymentRequest("cash", TOTAL, tendered=TOTAL)],
            customer_id=None,
            can_discount=False,
            idempotency_key=str(uuid.uuid4()),
            order_id=order.pk,
        )

    with org_context(world.org.id), pytest.raises(SaleError) as exc:
        sell()  # ready, still on the shelf: not settled yet
    assert exc.value.code == "order_not_ready"
    staff, _ = owner_at(world, world.khartoum.pk)
    assert staff.get(f"/api/v1/orders/{order.pk}/pos/").status_code == 400


def test_a_courier_sees_and_moves_only_their_own_orders(world: World) -> None:
    _, _, order, _ = delivery_order(world)
    staff, scsrf = owner_at(world, world.khartoum.pk)
    first, fcsrf = courier_client(world, "hasan")
    second, scsrf2 = courier_client(world, "omar")
    staff_courier = next(
        c["id"] for c in staff.get("/api/v1/couriers/").json() if c["username"] == "hasan"
    )
    staff.post(
        f"/api/v1/orders/{order.pk}/assign-courier/",
        {"courier_id": staff_courier},
        format="json",
        **scsrf,
    )
    assert second.get("/api/v1/deliveries/").json() == []
    assert (
        second.post(
            f"/api/v1/deliveries/{order.pk}/pickup/", {}, format="json", **scsrf2
        ).status_code
        == 404
    )
    cashier_like = csrf_client()
    assert cashier_like.get("/api/v1/deliveries/").status_code in (401, 403)
    assert first.get("/api/v1/orders/").status_code == 403  # a courier is not order staff
    assert first.get(f"/api/v1/deliveries/{order.pk}/nope/").status_code in (404, 405, 400)
    del fcsrf


def test_a_failed_delivery_goes_back_and_can_be_given_to_another_courier(world: World) -> None:
    _, _, order, _ = delivery_order(world)
    staff, scsrf = owner_at(world, world.khartoum.pk)
    courier, ccsrf = courier_client(world, "hasan")
    other, _ = courier_client(world, "omar")
    ids = {c["username"]: c["id"] for c in staff.get("/api/v1/couriers/").json()}
    assign = f"/api/v1/orders/{order.pk}/assign-courier/"
    staff.post(assign, {"courier_id": ids["hasan"]}, format="json", **scsrf)
    step = f"/api/v1/deliveries/{order.pk}"
    courier.post(f"{step}/pickup/", {}, format="json", **ccsrf)
    assert (
        staff.post(assign, {"courier_id": ids["omar"]}, format="json", **scsrf).status_code == 400
    )  # on the way
    assert courier.post(f"{step}/fail/", {"reason": " "}, format="json", **ccsrf).status_code == 400
    failed = courier.post(f"{step}/fail/", {"reason": "لا أحد في البيت"}, format="json", **ccsrf)
    assert (
        failed.json()["status"] == "delivery_failed"
        and failed.json()["reason"] == "لا أحد في البيت"
    )
    detail = staff.get(f"/api/v1/orders/{order.pk}/").json()
    assert detail["allowed"] == ["cancelled", "ready"]
    back = staff.post(
        f"/api/v1/orders/{order.pk}/transition/", {"to": "ready"}, format="json", **scsrf
    )
    assert back.status_code == 200 and back.json()["courier_id"] is None
    staff.post(assign, {"courier_id": ids["omar"]}, format="json", **scsrf)
    assert len(other.get("/api/v1/deliveries/").json()) == 1
    assert courier.get("/api/v1/deliveries/").json() == []


def test_assignment_needs_a_ready_home_delivery(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        slug = stocked_listing(world).slug
    client, csrf = guest()
    place(client, csrf, slug)  # a pickup order
    with org_context(world.org.id):
        order = Order.objects.get()
    staff, scsrf = owner_at(world, world.khartoum.pk)
    courier_client(world)
    cid = staff.get("/api/v1/couriers/").json()[0]["id"]
    refused = staff.post(
        f"/api/v1/orders/{order.pk}/assign-courier/", {"courier_id": cid}, format="json", **scsrf
    )
    assert refused.json()["detail"] == "not_a_delivery"


def test_a_prepaid_delivery_collects_nothing_and_settles_with_the_verified_transfer(
    world: World,
) -> None:
    with org_context(world.org.id):
        prepay_open(world)
        store = open_store(world)
        store.delivery_enabled = True
        store.prepay_enabled = True
        store.save()
        listing = stocked_listing(world, boxes=3)
        with_shift(world)
    client, csrf = guest()
    assert place(client, csrf, listing.slug, fulfillment="delivery", **bank()).status_code == 201
    staff, scsrf = owner_at(world, world.khartoum.pk)
    with org_context(world.org.id):
        order = Order.objects.get()
        transition(order.pk, "confirmed", "", world.owner)
    staff.post(f"/api/v1/orders/{order.pk}/payment/", {"action": "verify"}, format="json", **scsrf)
    with org_context(world.org.id):
        transition(order.pk, "preparing", "", world.owner)
        transition(order.pk, "ready", "", world.owner)
    courier, ccsrf = courier_client(world)
    cid = staff.get("/api/v1/couriers/").json()[0]["id"]
    staff.post(
        f"/api/v1/orders/{order.pk}/assign-courier/", {"courier_id": cid}, format="json", **scsrf
    )
    step = f"/api/v1/deliveries/{order.pk}"
    card = courier.get("/api/v1/deliveries/").json()[0]
    assert card["amount_due"] is None and card["payment_status"] == "verified"
    courier.post(f"{step}/pickup/", {}, format="json", **ccsrf)
    cash = courier.post(f"{step}/deliver/", {"collected": "100"}, format="json", **ccsrf)
    assert cash.json()["detail"] == "prepaid_collects_nothing"
    assert (
        courier.post(f"{step}/deliver/", {}, format="json", **ccsrf).json()["status"] == "delivered"
    )
    with org_context(world.org.id):
        post_sale(
            device=world.counter,
            user=world.cashier,
            lines=[line(listing.item)],
            payments=[PaymentRequest("bank", TOTAL, bank_reference="TX-100200")],
            customer_id=None,
            can_discount=False,
            idempotency_key=str(uuid.uuid4()),
            order_id=order.pk,
        )
        order.refresh_from_db()
        assert order.status == "completed"


def test_the_customer_never_sees_the_courier(world: World) -> None:
    client, _, order, _ = delivery_order(world)
    staff, scsrf = owner_at(world, world.khartoum.pk)
    courier_client(world)
    cid = staff.get("/api/v1/couriers/").json()[0]["id"]
    staff.post(
        f"/api/v1/orders/{order.pk}/assign-courier/", {"courier_id": cid}, format="json", **scsrf
    )
    shown = client.get(f"/api/v1/public/orders/{order.token}/").json()
    assert shown["fulfillment"] == "delivery" and shown["status"] == "ready"
    assert "hasan" not in str(shown) and "courier" not in str(shown)
