"""WO-30a acceptance: paying by bank transfer before pickup, and choosing pickup or delivery."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import pytest

from apps.orders.models import Order, OrderPaymentEvent
from apps.orders.services.workflow import WorkflowError, transition
from apps.returns.tests.test_api import owner_at
from apps.sales.models import Payment
from apps.sales.services.posting import PaymentRequest, SaleError, post_sale
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import line, with_shift
from tests.storefront import open_store, stocked_listing

from .test_inquiries import guest
from .test_orders import body

pytestmark = pytest.mark.django_db

URL = "/api/v1/public/orders/"
TOTAL = Decimal("12500")


def place(client: Any, csrf: dict[str, Any], slug: str, **over: Any) -> Any:
    return client.post(
        URL,
        {**body(slug, qty=1, phone=over.pop("phone", "0912345678")), **over},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        **csrf,
    )


def prepay_open(world: World) -> None:
    store = open_store(world)
    store.prepay_enabled = True
    store.bank_accounts = "بنك الخرطوم — 1234567 — صيدلية الشفاء"
    store.orders_per_hour = 50
    store.save()


def bank(ref: str = "TX-100200", amount: str = "12500") -> dict[str, Any]:
    return {"payment_method": "bank", "payment_reference": ref, "paid_amount": amount}


def test_prepay_and_delivery_are_off_until_the_pharmacy_turns_them_on(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        slug = stocked_listing(world).slug
    client, csrf = guest()
    off = place(client, csrf, slug, **bank())
    assert off.status_code == 400 and off.json()["detail"] == "prepay_unavailable"
    home = place(client, csrf, slug, fulfillment="delivery")
    assert home.json()["detail"] == "delivery_unavailable"
    plain = place(client, csrf, slug)
    assert plain.status_code == 201
    with org_context(world.org.id):
        order = Order.objects.get()
        assert (order.fulfillment, order.payment_method, order.payment_status) == (
            "pickup",
            "cod",
            "none",
        )


def test_transfer_details_sent_with_the_order_wait_for_verification(world: World) -> None:
    with org_context(world.org.id):
        prepay_open(world)
        slug = stocked_listing(world).slug
    client, csrf = guest()
    bad = place(client, csrf, slug, **bank(ref="12"))
    assert bad.json()["detail"] == "invalid_reference"
    assert place(client, csrf, slug, **bank(amount="0")).json()["detail"] == "invalid_amount"
    cod_with_ref = place(client, csrf, slug, payment_reference="TX-1", paid_amount="1")
    assert cod_with_ref.json()["detail"] == "cod_has_no_transfer"
    sent = place(client, csrf, slug, **bank(ref="tx 100 200"))
    assert sent.status_code == 201, sent.json()
    with org_context(world.org.id):
        order = Order.objects.get()
        assert order.payment_status == "submitted"
        assert (order.payment_reference, order.paid_amount) == ("TX100200", TOTAL)
        assert OrderPaymentEvent.objects.get(order=order).kind == "submitted"
    # The same transfer cannot pay a second order, however it is typed.
    again = place(client, csrf, slug, phone="0922222222", **bank(ref="TX100200"))
    assert again.status_code == 400 and again.json()["detail"] == "reference_used"
    public = client.get(f"{URL}{order.token}/").json()
    assert public["payment_status"] == "submitted" and "payment_reference" not in public


def test_send_the_transfer_after_the_order_and_after_a_rejection(world: World) -> None:
    with org_context(world.org.id):
        prepay_open(world)
        slug = stocked_listing(world).slug
    client, csrf = guest()
    placed = place(client, csrf, slug, payment_method="bank")
    assert placed.status_code == 201
    with org_context(world.org.id):
        order = Order.objects.get()
        assert order.payment_status == "awaiting_proof"
    pay = f"{URL}{order.token}/payment/"
    assert (
        client.post(pay, {"reference": "ab", "paid_amount": "1"}, format="json", **csrf).status_code
        == 400
    )
    ok = client.post(pay, {"reference": "BK-778899", "paid_amount": "12500"}, format="json", **csrf)
    assert ok.status_code == 200 and ok.json()["payment_status"] == "submitted"
    twice = client.post(pay, {"reference": "BK-111111", "paid_amount": "1"}, format="json", **csrf)
    assert twice.json()["detail"] == "payment_not_open"
    assert (
        client.post(
            f"{URL}{'x' * 40}/payment/",
            {"reference": "BK-1", "paid_amount": "1"},
            format="json",
            **csrf,
        ).status_code
        == 404
    )

    staff, scsrf = owner_at(world, world.khartoum.pk)
    act = f"/api/v1/orders/{order.pk}/payment/"
    no_reason = staff.post(act, {"action": "reject"}, format="json", **scsrf)
    assert no_reason.json()["detail"] == "reason_required"
    rejected = staff.post(
        act, {"action": "reject", "note": "المبلغ غير مطابق"}, format="json", **scsrf
    )
    assert rejected.json()["payment_status"] == "rejected"
    shown = client.get(f"{URL}{order.token}/").json()
    assert shown["payment_status"] == "rejected" and shown["payment_note"] == "المبلغ غير مطابق"
    # After a rejection the customer can send corrected details, even the same reference.
    fixed = client.post(
        pay, {"reference": "BK-778899", "paid_amount": "12500"}, format="json", **csrf
    )
    assert fixed.json()["payment_status"] == "submitted"


def test_preparing_a_prepaid_order_needs_verification_or_a_recorded_reason(world: World) -> None:
    with org_context(world.org.id):
        prepay_open(world)
        slug = stocked_listing(world).slug
    client, csrf = guest()
    place(client, csrf, slug, **bank())
    with org_context(world.org.id):
        order = Order.objects.get()
        transition(order.pk, "confirmed", "", world.owner)
        with pytest.raises(WorkflowError) as exc:
            transition(order.pk, "preparing", "", world.owner)
        assert exc.value.code == "payment_not_verified"
    staff, scsrf = owner_at(world, world.khartoum.pk)
    verified = staff.post(
        f"/api/v1/orders/{order.pk}/payment/", {"action": "verify"}, format="json", **scsrf
    )
    assert verified.status_code == 200 and verified.json()["payment_status"] == "verified"
    assert [e["kind"] for e in verified.json()["payment_events"]] == ["submitted", "verified"]
    with org_context(world.org.id):
        transition(order.pk, "preparing", "", world.owner)

    # Preparing without verifying is possible only with a reason, which is kept.
    other, ocsrf = guest()
    place(other, ocsrf, slug, phone="0933333333", **bank(ref="ZZ-9999"))
    with org_context(world.org.id):
        second = Order.objects.exclude(pk=order.pk).get()
        transition(second.pk, "confirmed", "", world.owner)
        transition(second.pk, "preparing", "customer showed the receipt", world.owner)
        kinds = list(second.payment_events.values_list("kind", flat=True))
        assert kinds == ["submitted", "override"]


def test_cancelling_after_the_transfer_leaves_a_refund_to_record(world: World) -> None:
    with org_context(world.org.id):
        prepay_open(world)
        slug = stocked_listing(world).slug
    client, csrf = guest()
    place(client, csrf, slug, **bank())
    staff, scsrf = owner_at(world, world.khartoum.pk)
    with org_context(world.org.id):
        order = Order.objects.get()
        transition(order.pk, "cancelled", "out of stock", world.owner)
        order.refresh_from_db()
        assert order.payment_status == "refund_due"
    act = f"/api/v1/orders/{order.pk}/payment/"
    assert (
        staff.post(act, {"action": "refunded"}, format="json", **scsrf).json()["detail"]
        == "reason_required"
    )
    done = staff.post(act, {"action": "refunded", "note": "REF-5521"}, format="json", **scsrf)
    assert done.json()["payment_status"] == "refunded"
    assert staff.post(act, {"action": "verify"}, format="json", **scsrf).status_code == 400


def test_a_verified_transfer_pays_the_sale_and_an_overpayment_is_refundable(world: World) -> None:
    with org_context(world.org.id):
        prepay_open(world)
        listing = stocked_listing(world, boxes=2)
        with_shift(world)
        slug = listing.slug
    client, csrf = guest()
    place(client, csrf, slug, **bank(amount="20000"))
    staff, scsrf = owner_at(world, world.khartoum.pk)
    with org_context(world.org.id):
        order = Order.objects.get()
        transition(order.pk, "confirmed", "", world.owner)
    staff.post(f"/api/v1/orders/{order.pk}/payment/", {"action": "verify"}, format="json", **scsrf)
    with org_context(world.org.id):
        transition(order.pk, "preparing", "", world.owner)
        transition(order.pk, "ready", "", world.owner)

        def sell(payments: list[PaymentRequest]) -> dict[str, object]:
            return post_sale(
                device=world.counter,
                user=world.cashier,
                lines=[line(listing.item)],  # type: ignore[arg-type]
                payments=payments,
                customer_id=None,
                can_discount=False,
                idempotency_key=str(uuid.uuid4()),
                order_id=order.pk,
            )

        with pytest.raises(SaleError) as exc:
            sell([PaymentRequest("cash", TOTAL)])  # ignoring the transfer would charge twice
        assert exc.value.code == "prepaid_mismatch"
        with pytest.raises(SaleError) as exc:
            sell([PaymentRequest("bank", TOTAL, bank_reference="OTHER-1")])
        assert exc.value.code == "prepaid_mismatch"
        sell([PaymentRequest("bank", TOTAL, bank_reference="tx-100200")])
        pay = Payment.objects.get()
        assert pay.verification == "confirmed" and pay.bank_reference == "tx-100200"
        order.refresh_from_db()
        assert order.status == "completed"
        assert order.payment_status == "refund_due"  # 20 000 sent, 12 500 sold
        assert order.payment_events.filter(kind="refund_due").get().amount == Decimal("7500")


def test_unverified_transfer_blocks_the_sale_and_cash_orders_are_unchanged(world: World) -> None:
    with org_context(world.org.id):
        prepay_open(world)
        listing = stocked_listing(world, boxes=2)
        with_shift(world)
    client, csrf = guest()
    place(client, csrf, listing.slug, **bank())
    with org_context(world.org.id):
        order = Order.objects.get()
        transition(order.pk, "confirmed", "", world.owner)
        transition(order.pk, "preparing", "seen the receipt", world.owner)
        transition(order.pk, "ready", "", world.owner)
        with pytest.raises(SaleError) as exc:
            post_sale(
                device=world.counter,
                user=world.cashier,
                lines=[line(listing.item)],  # type: ignore[arg-type]
                payments=[PaymentRequest("cash", TOTAL)],
                customer_id=None,
                can_discount=False,
                idempotency_key=str(uuid.uuid4()),
                order_id=order.pk,
            )
        assert exc.value.code == "payment_unverified"


def test_delivery_and_prepay_are_pickup_only_for_prescription_items(world: World) -> None:
    from apps.catalog.models import Item

    with org_context(world.org.id):
        store = open_store(world)
        store.prepay_enabled = True
        store.delivery_enabled = True
        store.bank_accounts = "حساب"
        store.save()
        listing = stocked_listing(world)
        Item.objects.filter(pk=listing.item.pk).update(classification=Item.Classification.RX)
    client, csrf = guest()
    assert (
        place(client, csrf, listing.slug, fulfillment="delivery").json()["detail"]
        == "delivery_pickup_only"
    )
    assert place(client, csrf, listing.slug, **bank()).json()["detail"] == "prepay_pickup_only"
    assert place(client, csrf, listing.slug).status_code == 201


def test_delivery_is_recorded_when_the_pharmacy_delivers(world: World) -> None:
    with org_context(world.org.id):
        store = open_store(world)
        store.delivery_enabled = True
        store.save()
        slug = stocked_listing(world).slug
    client, csrf = guest()
    assert place(client, csrf, slug, fulfillment="delivery").status_code == 201
    staff, _ = owner_at(world, world.khartoum.pk)
    row = staff.get("/api/v1/orders/").json()[0]
    assert (row["fulfillment"], row["payment_method"]) == ("delivery", "cod")
    assert place(client, csrf, slug, fulfillment="drone").status_code == 400
