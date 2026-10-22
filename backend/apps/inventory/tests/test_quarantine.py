from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal

import pytest

from apps.finance.models import JournalLine
from apps.finance.services.ledger import supplier_balance
from apps.inventory.models import Batch, Location, QuarantineEntry, StockBalance
from apps.inventory.services.quarantine import QuarantineError, decide, recall
from apps.returns.tests.helpers import give_back, sell
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import stocked, with_shift
from tests.stock import supplier

pytestmark = pytest.mark.django_db


def on(item_id: object, kind: str) -> int:
    return sum(
        StockBalance.objects.filter(item_id=item_id, location__kind=kind).values_list(
            "quantity_base", flat=True
        )
    )


def returned_entry(world: World, boxes: int = 2) -> QuarantineEntry:
    item = stocked(world, boxes=boxes)
    with_shift(world)
    give_back(world, sell(world, item, boxes=1), 1)
    entry: QuarantineEntry = QuarantineEntry.objects.get()
    return entry


def test_restock_puts_it_back_on_the_shelf(world: World) -> None:
    with org_context(world.org.id):
        entry = returned_entry(world)
        before = on(entry.item_id, Location.Kind.SELLABLE)
        decide(entry.pk, "restock", "sealed", idempotency_key=str(uuid.uuid4()), user=world.owner)
        assert on(entry.item_id, Location.Kind.SELLABLE) == before + 14
        assert on(entry.item_id, Location.Kind.QUARANTINE) == 0
        entry.refresh_from_db()
        assert entry.status == "restocked" and entry.decided_by == world.owner
        with pytest.raises(QuarantineError) as exc:
            decide(entry.pk, "destroy", "", idempotency_key=str(uuid.uuid4()), user=world.owner)
        assert exc.value.code == "already_decided"


def test_destroy_writes_off_at_cost(world: World) -> None:
    with org_context(world.org.id):
        entry = returned_entry(world)
        decide(entry.pk, "destroy", "", idempotency_key=str(uuid.uuid4()), user=world.owner)
        cost = entry.unit_cost * entry.quantity_base
        lines = {
            (j.account.code, j.debit, j.credit)
            for j in JournalLine.objects.filter(entry__document_id=entry.pk)
        }
        assert lines == {("5100", cost, Decimal(0)), ("1200", Decimal(0), cost)}
        assert on(entry.item_id, Location.Kind.QUARANTINE) == 0


def test_return_to_supplier_reduces_what_we_owe(world: World) -> None:
    with org_context(world.org.id):
        entry = returned_entry(world)
        owed = supplier_balance(supplier().pk)
        decide(entry.pk, "return", "", idempotency_key=str(uuid.uuid4()), user=world.owner)
        assert supplier_balance(supplier().pk) == owed - entry.unit_cost * entry.quantity_base


def test_expired_batch_cannot_be_restocked(world: World) -> None:
    with org_context(world.org.id):
        entry = returned_entry(world)
        Batch.objects.filter(pk=entry.batch_id).update(expiry_date=dt.date(2020, 1, 1))
        with pytest.raises(QuarantineError) as exc:
            decide(entry.pk, "restock", "", idempotency_key=str(uuid.uuid4()), user=world.owner)
        assert exc.value.code == "batch_expired"


def test_recall_holds_the_whole_batch(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)
        batch = Batch.objects.get(item=item)
        recall(
            world.khartoum,
            batch.pk,
            "manufacturer recall",
            idempotency_key=str(uuid.uuid4()),
            user=world.owner,
        )
        assert on(item.pk, Location.Kind.SELLABLE) == 0
        assert on(item.pk, Location.Kind.QUARANTINE) == 42
        entry = QuarantineEntry.objects.get()
        assert entry.source == "recall" and entry.quantity_base == 42
        with pytest.raises(QuarantineError) as exc:
            recall(
                world.khartoum,
                batch.pk,
                "again",
                idempotency_key=str(uuid.uuid4()),
                user=world.owner,
            )
        assert exc.value.code == "nothing_to_recall"
