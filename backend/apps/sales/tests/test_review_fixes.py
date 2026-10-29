"""WO-32: the financial and security findings of the WO-20 review (B-01..B-05)."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.accounts.tests.test_auth import csrf_client, login
from apps.finance.models import JournalLine
from apps.finance.services.payments import payment_payload
from apps.inventory.models import Batch
from apps.inventory.tests.test_concurrency import race
from apps.orders.models import Order
from apps.orders.services.placing import LineRequest, Place, place_order
from apps.orders.services.workflow import transition
from apps.returns.services.posting import ReturnError
from apps.returns.tests.helpers import give_back, sell
from apps.sales.models import Shift
from apps.sales.services.posting import PaymentRequest, SaleError, post_sale, sale_payload
from apps.sales.services.shifts import cash_taken, close_shift
from apps.sync.services.idempotency import payload_hash
from apps.tenancy.context import org_context
from tests.factories import World, make_user
from tests.selling import line, stocked, with_shift
from tests.storefront import open_store, stocked_listing

pytestmark = pytest.mark.django_db


def at_branch(
    world: World, username: str, role: str, branch: Any
) -> tuple[APIClient, dict[str, Any]]:
    with org_context(world.org.id):
        make_user(username, role, branch)
    client = csrf_client()
    login(client, username)
    csrf: dict[str, Any] = {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}
    client.post(
        "/api/v1/auth/context/",
        {"branch_id": str(branch.pk), "device_id": None},
        format="json",
        **csrf,
    )
    return client, csrf


def test_b01_a_role_in_one_branch_never_reaches_another_branchs_shift_or_sale(
    world: World,
) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=2)
        with_shift(world)
        sale = sell(world, item, boxes=1)
        shift = Shift.objects.get(status=Shift.Status.OPEN)
    other, csrf = at_branch(world, "omar", "pharmacist", world.omdurman)
    closed = other.post(
        f"/api/v1/shifts/{shift.pk}/close/",
        {"counted_cash": "0"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        **csrf,
    )
    assert closed.status_code == 404
    for path in (f"/api/v1/sales/{sale.pk}/", f"/api/v1/sales/{sale.pk}/receipt/"):
        assert other.get(path).status_code == 404
    with org_context(world.org.id):
        shift.refresh_from_db()
        assert shift.status == Shift.Status.OPEN
        # The service refuses too, whoever calls it.
        with pytest.raises(Exception) as exc:
            close_shift(
                shift.pk,
                Decimal("0"),
                idempotency_key=str(uuid.uuid4()),
                user=world.owner,
                branch=world.omdurman,
            )
        assert getattr(exc.value, "code", "") == "other_branch"


def test_b03_a_reserved_batch_that_expired_is_not_sold(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        listing = stocked_listing(world, boxes=2)
        with_shift(world)
        placed = place_order(
            name="سلمى",
            phone="0912345678",
            note="",
            lines=[LineRequest(listing.slug, 1)],
            place=Place("الخرطوم"),
            idempotency_key=str(uuid.uuid4()),
        )
        order = Order.objects.get(number=placed["number"])
        for to in ("confirmed", "preparing", "ready"):
            transition(order.pk, to, "", world.owner)
        # Overnight, the held batch passed its expiry date.
        Batch.objects.filter(item=listing.item).update(
            expiry_date=dt.date.today() - dt.timedelta(days=1)
        )
        with pytest.raises(SaleError) as exc:
            post_sale(
                device=world.counter,
                user=world.cashier,
                lines=[line(listing.item)],
                payments=[PaymentRequest("cash", Decimal("12500"))],
                customer_id=None,
                can_discount=False,
                idempotency_key=str(uuid.uuid4()),
                order_id=order.pk,
            )
        assert exc.value.code == "reserved_batch_expired"


def test_b04_a_verified_prepaid_transfer_is_booked_to_the_bank(world: World) -> None:
    from apps.orders.tests.test_inquiries import guest
    from apps.orders.tests.test_payments import bank, place, prepay_open

    with org_context(world.org.id):
        prepay_open(world)
        listing = stocked_listing(world, boxes=2)
        with_shift(world)
    client, csrf = guest()
    place(client, csrf, listing.slug, **bank())
    with org_context(world.org.id):
        from apps.orders.services import payments

        order = Order.objects.get()
        transition(order.pk, "confirmed", "", world.owner)
        payments.verify(order.pk, world.owner)
        transition(order.pk, "preparing", "", world.owner)
        transition(order.pk, "ready", "", world.owner)
        result = post_sale(
            device=world.counter,
            user=world.cashier,
            lines=[line(listing.item)],
            payments=[PaymentRequest("bank", Decimal("12500"), bank_reference="TX-100200")],
            customer_id=None,
            can_discount=False,
            idempotency_key=str(uuid.uuid4()),
            order_id=order.pk,
        )
        lines = JournalLine.objects.filter(entry__document_id=result["id"])
        debits = {row.account.code: row.debit for row in lines if row.debit}
        assert debits.get("1010") == Decimal("12500")
        assert "1020" not in debits


def test_b05_the_same_key_with_another_account_branch_or_note_is_a_different_request(
    world: World,
) -> None:
    def sale(account: str) -> str:
        return payload_hash(
            sale_payload(
                world.counter,
                None,
                [],
                [PaymentRequest("bank", Decimal("10"), bank_reference="R1", bank_account=account)],
            )
        )

    assert sale("BANK-A") != sale("BANK-B")
    party = uuid.uuid4()
    base = payment_payload("customer", party, "cash", Decimal("5"), "", world.khartoum.pk, "")
    assert base != payment_payload(
        "customer", party, "cash", Decimal("5"), "", world.omdurman.pk, ""
    )
    assert base != payment_payload(
        "customer", party, "cash", Decimal("5"), "", world.khartoum.pk, "x"
    )


@pytest.mark.django_db(transaction=True)
def test_b02_a_cash_refund_never_joins_a_shift_that_closed_first(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=2)
        with_shift(world)
        sale = sell(world, item, boxes=1)
        shift = Shift.objects.get(status=Shift.Status.OPEN)

    def act(i: int) -> object:
        with org_context(world.org.id):
            if i == 0:
                return give_back(world, sale, 1)
            return close_shift(
                shift.pk, Decimal("0"), idempotency_key=str(uuid.uuid4()), user=world.owner
            )

    results = race(act)
    with org_context(world.org.id):
        shift.refresh_from_db()
        closed = results[1]
        assert isinstance(closed, dict), closed
        refunded = isinstance(results[0], dict)
        if not refunded:
            assert isinstance(results[0], ReturnError) and results[0].code == "shift_closed"
        # Whatever the order, the stored count equals the drawer's movements.
        assert Decimal(str(closed["expected_cash"])) == shift.opening_cash + cash_taken(shift)
