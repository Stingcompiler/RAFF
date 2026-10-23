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


def test_a_sale_locks_its_balances_and_nothing_they_join(world: World) -> None:
    """Regression: `select_for_update()` next to `select_related("batch")` and a filter on the
    location also locked those rows, so a goods receipt's COMMIT-time foreign key check
    (`FOR KEY SHARE`) deadlocked with a sale on the same shelf (seen in e2e)."""
    from concurrent.futures import ThreadPoolExecutor

    from django.db import OperationalError, connection, transaction

    from apps.inventory.models import Batch, Location
    from apps.sales.services.posting import lock_candidates

    with org_context(world.org.id):
        item = stocked(world, boxes=2)
        batch_ids = list(Batch.objects.filter(item=item).values_list("pk", flat=True))
        location_ids = list(
            StockBalance.objects.filter(item=item).values_list("location_id", flat=True)
        )

    def try_lock(table: str, ids: list[uuid.UUID], mode: str) -> bool:
        """Another connection asks for a lock on these rows and refuses to wait."""
        try:
            with transaction.atomic(), connection.cursor() as cursor:
                cursor.execute(
                    f"SELECT 1 FROM {table} WHERE id = ANY(%s) FOR {mode} NOWAIT",  # noqa: S608
                    [ids],
                )
            return True
        except OperationalError:
            return False
        finally:
            connection.close()

    balance_table = StockBalance._meta.db_table
    with org_context(world.org.id), transaction.atomic():
        balances = lock_candidates(world.khartoum.pk, {item.pk})
        balance_ids = [b.pk for b in balances[item.pk]]
        with ThreadPoolExecutor(max_workers=1) as pool:

            def probe(table: str, ids: list[uuid.UUID], mode: str) -> bool:
                return pool.submit(try_lock, table, ids, mode).result()

            # The sale holds its balance rows ...
            assert not probe(balance_table, balance_ids, "UPDATE")
            # ... but not the shelf or the batch, which other postings reference.
            assert probe(Location._meta.db_table, location_ids, "KEY SHARE")
            assert probe(Batch._meta.db_table, batch_ids, "KEY SHARE")
