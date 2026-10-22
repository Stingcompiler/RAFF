from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from apps.finance.models import JournalLine
from apps.inventory.models import Location, StockBalance, Stocktake
from apps.inventory.services.stocktake import StocktakeError, approve, save_counts, start
from apps.returns.tests.helpers import sell
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import stocked, with_shift

pytestmark = pytest.mark.django_db


def shelf(item_id: object) -> int:
    return sum(
        StockBalance.objects.filter(
            item_id=item_id, location__kind=Location.Kind.SELLABLE
        ).values_list("quantity_base", flat=True)
    )


def count(take: Stocktake, item_id: uuid.UUID, counted: int, reason: str = "") -> None:
    line = take.lines.get(item_id=item_id)
    save_counts(
        take.pk, [{"line_id": line.pk, "counted_base": counted, "reason": reason}], take.created_by
    )


def test_old_count_does_not_erase_a_newer_sale(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)  # 42 tablets
        with_shift(world)
        take = start(world.khartoum, category=None, user=world.owner)
        assert take.lines.get(item=item).system_base == 42
        sell(world, item, boxes=1)  # 14 leave after the snapshot
        count(take, item.pk, 40, reason="broken strip")  # 2 short at snapshot time
        approve(take.pk, idempotency_key=str(uuid.uuid4()), user=world.owner)
        # 42 - 14 sold - 2 short = 26, not the 40 counted earlier.
        assert shelf(item.pk) == 26
        take.refresh_from_db()
        assert take.status == "approved"
        assert take.impact == Decimal("-1400.0000")  # 2 x 9800 / 14
        lines = {
            (j.account.code, j.debit, j.credit)
            for j in JournalLine.objects.filter(entry__document_id=take.pk)
        }
        assert lines == {
            ("5100", Decimal("1400"), Decimal(0)),
            ("1200", Decimal(0), Decimal("1400")),
        }


def test_overage_is_added_and_needs_a_reason(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=1)
        take = start(world.khartoum, category=None, user=world.owner)
        count(take, item.pk, 20)
        with pytest.raises(StocktakeError) as exc:
            approve(take.pk, idempotency_key=str(uuid.uuid4()), user=world.owner)
        assert exc.value.code == "reason_required"
        count(take, item.pk, 20, reason="found behind the shelf")
        approve(take.pk, idempotency_key=str(uuid.uuid4()), user=world.owner)
        assert shelf(item.pk) == 20


def test_approved_stocktake_is_closed(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=1)
        take = start(world.khartoum, category=None, user=world.owner)
        count(take, item.pk, 14)
        key = str(uuid.uuid4())
        first = approve(take.pk, idempotency_key=key, user=world.owner)
        assert approve(take.pk, idempotency_key=key, user=world.owner) == first
        with pytest.raises(StocktakeError):
            approve(take.pk, idempotency_key=str(uuid.uuid4()), user=world.owner)
        with pytest.raises(StocktakeError):
            count(take, item.pk, 10)
        assert shelf(item.pk) == 14
