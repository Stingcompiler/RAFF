from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from apps.finance.models import JournalLine
from apps.inventory.models import Batch, Location, StockBalance
from apps.inventory.services.stock import InsufficientStock
from apps.tenancy.context import org_context
from apps.transfers.services.moving import LineInput, TransferError, receive, save_draft, send
from tests.factories import World
from tests.selling import stocked

pytestmark = pytest.mark.django_db


def at(branch: object, kind: str) -> int:
    return sum(
        StockBalance.objects.filter(branch=branch, location__kind=kind).values_list(
            "quantity_base", flat=True
        )
    )


def test_send_then_receive_with_a_shortfall(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)  # 42 at Khartoum
        batch = Batch.objects.get(item=item)
        t = save_draft(
            transfer=None,
            from_branch=world.khartoum,
            to_branch=world.omdurman,
            lines=[LineInput(batch.pk, 28)],
            note="",
            user=world.owner,
        )
        assert at(world.khartoum, Location.Kind.SELLABLE) == 42  # a draft moves nothing
        sent = send(t.pk, idempotency_key=str(uuid.uuid4()), user=world.owner)
        assert sent["number"] == "T-0001" and sent["status"] == "sent"
        assert at(world.khartoum, Location.Kind.SELLABLE) == 14
        assert at(world.khartoum, Location.Kind.TRANSIT) == 28

        line = t.lines.get()
        done = receive(
            t.pk, {str(line.pk): 26}, idempotency_key=str(uuid.uuid4()), user=world.owner
        )
        assert done["status"] == "partial"
        assert at(world.khartoum, Location.Kind.TRANSIT) == 0
        assert at(world.omdurman, Location.Kind.SELLABLE) == 26
        loss = batch.unit_cost * 2
        lines = {
            (j.account.code, j.debit, j.credit)
            for j in JournalLine.objects.filter(entry__document_id=t.pk)
        }
        assert lines == {("5100", loss, Decimal(0)), ("1200", Decimal(0), loss)}
        with pytest.raises(TransferError):
            receive(t.pk, {}, idempotency_key=str(uuid.uuid4()), user=world.owner)


def test_cannot_send_more_than_on_the_shelf(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=1)
        batch = Batch.objects.get(item=item)
        t = save_draft(
            transfer=None,
            from_branch=world.khartoum,
            to_branch=world.omdurman,
            lines=[LineInput(batch.pk, 15)],
            note="",
            user=world.owner,
        )
        with pytest.raises(InsufficientStock):
            send(t.pk, idempotency_key=str(uuid.uuid4()), user=world.owner)
        with pytest.raises(TransferError):
            save_draft(
                transfer=None,
                from_branch=world.khartoum,
                to_branch=world.khartoum,
                lines=[LineInput(batch.pk, 1)],
                note="",
                user=world.owner,
            )
