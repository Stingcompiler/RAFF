"""WO-09 acceptance: a held unit is sold once; cancelling releases; completion only from a sale."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from apps.inventory.models import StockBalance
from apps.orders.models import Order, OrderInvoiceLink, StockReservation
from apps.orders.services.placing import LineRequest, place_order
from apps.orders.services.workflow import transition
from apps.sales.models import Sale
from apps.sales.services.posting import PaymentRequest, SaleError, post_sale
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import line, with_shift
from tests.storefront import open_store, stocked_listing

pytestmark = pytest.mark.django_db


def order_for(world: World, slug: str, qty: int = 1) -> Order:
    placed = place_order(
        name="سلمى",
        phone="0912345678",
        note="",
        lines=[LineRequest(slug, qty)],
        idempotency_key=str(uuid.uuid4()),
    )
    order: Order = Order.objects.get(number=placed["number"])
    return order


def counter_sale(world: World, item: object, order: Order | None = None) -> dict[str, object]:
    return post_sale(
        device=world.counter,
        user=world.cashier,
        lines=[line(item)],  # type: ignore[arg-type]
        payments=[PaymentRequest("cash", Decimal("12500"))],
        customer_id=None,
        can_discount=False,
        idempotency_key=str(uuid.uuid4()),
        order_id=order.pk if order else None,
    )


def on_shelf(item: object) -> int:
    return sum(StockBalance.objects.filter(item=item).values_list("quantity_base", flat=True))


def test_held_last_box_is_sold_once_through_the_order(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        listing = stocked_listing(world, boxes=1)
        item = listing.item
        with_shift(world)
        order = order_for(world, listing.slug)
        transition(order.pk, "confirmed", "", world.owner)
        assert StockReservation.objects.get(order=order).quantity_base == 14

        with pytest.raises(SaleError) as exc:
            counter_sale(world, item)  # the counter may not take the held box
        assert exc.value.code == "insufficient_stock"
        with pytest.raises(SaleError) as exc:
            counter_sale(world, item, order)  # not ready yet
        assert exc.value.code == "order_not_ready"

        transition(order.pk, "preparing", "", world.owner)
        transition(order.pk, "ready", "", world.owner)
        result = counter_sale(world, item, order)
        order.refresh_from_db()
        assert order.status == "completed"
        assert OrderInvoiceLink.objects.get(order=order).sale_id == uuid.UUID(str(result["id"]))
        assert StockReservation.objects.get(order=order).status == "consumed"
        assert on_shelf(item) == 0  # one deduction, not two
        with pytest.raises(SaleError):
            counter_sale(world, item, order)
        assert Sale.objects.count() == 1


def test_shortage_asks_for_contact_and_cancel_releases(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        listing = stocked_listing(world, boxes=1)
        with_shift(world)
        big = order_for(world, listing.slug, qty=2)
        moved = transition(big.pk, "confirmed", "", world.owner)
        assert moved.status == "needs_contact" and moved.reason.startswith("shortage")
        assert not StockReservation.objects.filter(order=big).exists()

        small = order_for(world, listing.slug, qty=1)
        transition(small.pk, "confirmed", "", world.owner)
        transition(small.pk, "cancelled", "customer changed mind", world.owner)
        assert StockReservation.objects.get(order=small).status == "released"
        counter_sale(world, listing.item)  # the released box sells at the counter
        assert on_shelf(listing.item) == 0


def test_pos_rows_show_what_is_held(world: World) -> None:
    from apps.sales.selectors import pos_items

    with org_context(world.org.id):
        open_store(world)
        listing = stocked_listing(world, boxes=3)
        order = order_for(world, listing.slug, qty=2)
        transition(order.pk, "confirmed", "", world.owner)
        row = next(
            r for r in pos_items(world.khartoum, listing.item.code) if r["id"] == listing.item.pk
        )
        assert row["sellable_base"] == 42 and row["reserved_base"] == 28
