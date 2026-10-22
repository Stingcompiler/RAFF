"""Sales under real concurrency: two connections (CLAUDE.md rule 22)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from apps.inventory.models import StockBalance
from apps.inventory.tests.test_concurrency import race
from apps.sales.models import Sale
from apps.sales.services.posting import PaymentRequest, SaleError, post_sale
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import line, stocked, with_shift

pytestmark = pytest.mark.django_db(transaction=True)


def test_two_counters_race_for_the_last_box(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=1)
        with_shift(world)

    def sell(_: int) -> object:
        with org_context(world.org.id):
            return post_sale(
                device=world.counter,
                user=world.cashier,
                lines=[line(item)],
                payments=[PaymentRequest("cash", Decimal("12500"))],
                customer_id=None,
                can_discount=False,
                idempotency_key=str(uuid.uuid4()),
            )

    results = race(sell)
    assert sum(isinstance(r, dict) for r in results) == 1
    assert sum(isinstance(r, SaleError) and r.code == "insufficient_stock" for r in results) == 1
    with org_context(world.org.id):
        assert Sale.objects.count() == 1
        assert (
            sum(StockBalance.objects.filter(item=item).values_list("quantity_base", flat=True)) == 0
        )


def test_double_click_records_one_sale(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)
        with_shift(world)
    key = str(uuid.uuid4())

    def sell(_: int) -> object:
        from django.db import transaction

        from apps.sales.services.posting import sale_payload
        from apps.sync.services.idempotency import KeyRace, replay

        with org_context(world.org.id):
            lines = [line(item)]
            payments = [PaymentRequest("cash", Decimal("12500"))]
            try:
                return post_sale(
                    device=world.counter,
                    user=world.cashier,
                    lines=lines,
                    payments=payments,
                    customer_id=None,
                    can_discount=False,
                    idempotency_key=key,
                )
            except KeyRace:
                with transaction.atomic():
                    return replay(
                        "post_sale", key, sale_payload(world.counter, None, lines, payments)
                    )

    results = race(sell)
    assert all(isinstance(r, dict) for r in results), results
    assert results[0] == results[1]
    with org_context(world.org.id):
        assert Sale.objects.count() == 1
