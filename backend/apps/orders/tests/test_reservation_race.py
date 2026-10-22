"""Confirming an order and selling at the counter race for the last box (two connections)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from apps.inventory.tests.test_concurrency import race
from apps.orders.models import Order, StockReservation
from apps.orders.services.placing import LineRequest, place_order
from apps.orders.services.workflow import transition
from apps.sales.models import Sale
from apps.sales.services.posting import PaymentRequest, post_sale
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import line, with_shift
from tests.storefront import open_store, stocked_listing

pytestmark = pytest.mark.django_db(transaction=True)


def test_confirm_and_counter_sale_take_the_last_box_once(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        listing = stocked_listing(world, boxes=1)
        with_shift(world)
        placed = place_order(
            name="سلمى",
            phone="0912345678",
            note="",
            lines=[LineRequest(listing.slug, 1)],
            idempotency_key=str(uuid.uuid4()),
        )
        order = Order.objects.get(number=placed["number"])

    def act(i: int) -> object:
        with org_context(world.org.id):
            if i == 0:
                return transition(order.pk, "confirmed", "", world.owner).status
            return post_sale(
                device=world.counter,
                user=world.cashier,
                lines=[line(listing.item)],
                payments=[PaymentRequest("cash", Decimal("12500"))],
                customer_id=None,
                can_discount=False,
                idempotency_key=str(uuid.uuid4()),
            )

    results = race(act)
    with org_context(world.org.id):
        sold = Sale.objects.count()
        held = StockReservation.objects.filter(status="active").count()
    # Exactly one of them got the box: either the sale, or the reservation.
    assert sold + held == 1, results
    if sold:
        assert results[0] == "needs_contact"
    else:
        assert results[0] == "confirmed"
