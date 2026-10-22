"""Two real connections race for the last unit: exactly one succeeds (CLAUDE.md rule 22)."""

from __future__ import annotations

import threading
import uuid
from decimal import Decimal

import pytest
from django.db import connection, transaction

from apps.inventory.models import Batch, Location, StockBalance, StockMovement
from apps.inventory.services.stock import InsufficientStock, Move, apply_movements, location
from apps.purchasing.services.receiving import post_receipt
from apps.tenancy.context import org_context
from tests.factories import World
from tests.stock import boxed_item, draft

pytestmark = pytest.mark.django_db(transaction=True)


def race(target, n: int = 2) -> list[object]:  # type: ignore[no-untyped-def]
    results: list[object] = [None] * n
    barrier = threading.Barrier(n)

    def run(i: int) -> None:
        try:
            barrier.wait()
            results[i] = target(i)
        except Exception as exc:
            results[i] = exc
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def test_last_unit_is_taken_once(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item()
        batch = Batch.objects.create(item=item, batch_no="B", unit_cost=Decimal(0))
        shelf = location(world.khartoum, Location.Kind.SELLABLE)
        with transaction.atomic():
            apply_movements(
                world.khartoum,
                [Move(shelf, batch, 1, Decimal(0))],
                kind="adjustment",
                document_type="t",
                document_id=uuid.uuid4(),
                user=None,
            )

    def take(_: int) -> str:
        with org_context(world.org.id), transaction.atomic():
            apply_movements(
                world.khartoum,
                [Move(shelf, batch, -1, Decimal(0))],
                kind="sale",
                document_type="t",
                document_id=uuid.uuid4(),
                user=None,
            )
        return "ok"

    results = race(take)
    assert results.count("ok") == 1
    assert sum(isinstance(r, InsufficientStock) for r in results) == 1
    with org_context(world.org.id):
        assert StockBalance.objects.get(location=shelf, batch=batch).quantity_base == 0
        assert StockMovement.objects.filter(batch=batch, kind="sale").count() == 1


def test_double_click_posts_once(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item()
        receipt = draft(world.khartoum, world.owner, item)
    k = str(uuid.uuid4())

    def post(_: int) -> object:
        with org_context(world.org.id):
            return post_receipt(receipt.pk, idempotency_key=k, user=world.owner)

    results = race(post)
    assert all(isinstance(r, dict) for r in results), results
    assert results[0] == results[1]
    with org_context(world.org.id):
        assert StockMovement.objects.filter(document_id=receipt.pk).count() == 1
