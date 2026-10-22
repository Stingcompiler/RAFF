"""WO-12 performance targets on generated data: search p95 <= 1 s, sale approval p95 <= 2 s,
with 50,000 stock movements in the database. Run with `make perf` (CI runs it too)."""

from __future__ import annotations

import datetime as dt
import statistics
import time
import uuid
from collections.abc import Callable
from decimal import Decimal

import pytest
from django.db import connection

from apps.catalog.models import Item, ItemPrice, ItemUnit
from apps.catalog.search import search_document
from apps.catalog.services.items import ensure_default_price_lists
from apps.inventory.models import Batch, StockBalance, StockMovement
from apps.inventory.services.stock import location
from apps.sales.selectors import pos_items
from apps.sales.services.posting import PaymentRequest, post_sale
from apps.sales.services.pricing import LineRequest
from apps.tenancy import clock
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import with_shift

pytestmark = [pytest.mark.perf, pytest.mark.django_db]

ITEMS = 1_000
MOVEMENTS = 50_000
RUNS = 20


def p95(fn: Callable[[int], object]) -> float:
    times = []
    for i in range(RUNS):
        start = time.perf_counter()
        fn(i)
        times.append(time.perf_counter() - start)
    return statistics.quantiles(times, n=20)[-1]


def generate(world: World) -> list[Item]:
    org = world.org.id
    retail = ensure_default_price_lists()
    shelf = location(world.khartoum, "sellable")
    items = Item.objects.bulk_create(
        [
            Item(
                code=f"GEN-{n:05d}",
                name_ar=f"صنف تجريبي {n}",
                name_en=f"Generated item {n}",
                strength="500 mg",
                search_normalized=search_document(
                    f"صنف تجريبي {n}", f"Generated item {n}", f"GEN-{n:05d}"
                ),
                organization_id=org,
            )
            for n in range(ITEMS)
        ]
    )
    units = ItemUnit.objects.bulk_create(
        [
            ItemUnit(
                item=i,
                code="box",
                name_ar="علبة",
                name_en="Box",
                factor=1,
                is_base=True,
                is_default_sale=True,
                organization_id=org,
            )
            for i in items
        ]
    )
    ItemPrice.objects.bulk_create(
        [
            ItemPrice(
                price_list=retail,
                unit=u,
                price=Decimal("1000"),
                effective_from=dt.date(2020, 1, 1),
                organization_id=org,
            )
            for u in units
        ]
    )
    batches = Batch.objects.bulk_create(
        [
            Batch(
                item=i,
                batch_no="G1",
                expiry_date=clock.today() + dt.timedelta(days=700),
                unit_cost=Decimal("600"),
                organization_id=org,
            )
            for i in items
        ]
    )
    per = MOVEMENTS // ITEMS
    StockMovement.objects.bulk_create(
        [
            StockMovement(
                branch=world.khartoum,
                location=shelf,
                item_id=b.item_id,
                batch=b,
                quantity_base=1,
                unit_cost=Decimal("600"),
                kind="receipt",
                document_type="perf",
                document_id=uuid.uuid4(),
                organization_id=org,
            )
            for b in batches
            for _ in range(per)
        ],
        batch_size=5_000,
    )
    StockBalance.objects.bulk_create(
        [
            StockBalance(
                branch=world.khartoum,
                location=shelf,
                item_id=b.item_id,
                batch=b,
                quantity_base=per,
                organization_id=org,
            )
            for b in batches
        ]
    )
    with connection.cursor() as cursor:
        cursor.execute("ANALYZE")
    return items


def test_search_and_approval_meet_the_targets(world: World) -> None:
    with org_context(world.org.id):
        items = generate(world)
        assert StockMovement.objects.count() >= MOVEMENTS
        with_shift(world)
        units = {u.item_id: u.pk for u in ItemUnit.objects.filter(item__in=items)}

        search = p95(lambda i: pos_items(world.khartoum, f"generated item {i * 37}"))
        barcode_like = p95(lambda i: pos_items(world.khartoum, f"GEN-{i * 41:05d}"))

        def approve(i: int) -> object:
            item = items[i * 13]
            return post_sale(
                device=world.counter,
                user=world.cashier,
                lines=[LineRequest(item_id=item.pk, unit_id=units[item.pk], quantity=1)],
                payments=[PaymentRequest("cash", Decimal("1000"))],
                customer_id=None,
                can_discount=False,
                idempotency_key=str(uuid.uuid4()),
            )

        approval = p95(approve)
    print(f"\np95 search {search:.3f}s, code search {barcode_like:.3f}s, approval {approval:.3f}s")
    assert search <= 1.0
    assert barcode_like <= 1.0
    assert approval <= 2.0
