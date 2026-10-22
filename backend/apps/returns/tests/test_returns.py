from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from apps.finance.models import Customer, JournalLine
from apps.inventory.models import Location, QuarantineEntry, StockBalance
from apps.returns.models import SaleReturn
from apps.returns.services.posting import ReturnError
from apps.sales.models import Shift
from apps.sales.services.posting import PaymentRequest, SaleError, post_sale
from apps.sales.services.shifts import summary
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import line, stocked, with_shift

from .helpers import give_back, sell

pytestmark = pytest.mark.django_db


def on(item_id: object, kind: str) -> int:
    return sum(
        StockBalance.objects.filter(item_id=item_id, location__kind=kind).values_list(
            "quantity_base", flat=True
        )
    )


def test_return_goes_to_quarantine_refunds_cash_and_reverses_cost(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)
        with_shift(world)
        sale = sell(world, item, boxes=2)
        result = give_back(world, sale, 1)

        assert result["number"] == "RET-000001"
        assert Decimal(str(result["total"])) == Decimal("12500")
        assert on(item.pk, Location.Kind.QUARANTINE) == 14
        assert on(item.pk, Location.Kind.SELLABLE) == 14
        entry = QuarantineEntry.objects.get()
        assert entry.status == "pending" and entry.quantity_base == 14
        ret = SaleReturn.objects.get()
        lines = {
            (j.account.code, j.debit, j.credit)
            for j in JournalLine.objects.filter(entry__document_id=ret.pk)
        }
        assert ("4000", Decimal("12500"), Decimal(0)) in lines
        assert ("1000", Decimal(0), Decimal("12500")) in lines
        assert ("1200", ret.cost_total, Decimal(0)) in lines
        # The drawer paid the refund.
        shift = Shift.objects.get()
        assert summary(shift)["expected_cash"] == Decimal("50000") + 25000 - 12500


def test_cumulative_returns_never_exceed_what_was_sold(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)
        with_shift(world)
        sale = sell(world, item, boxes=2)
        give_back(world, sale, 1)
        give_back(world, sale, 1)
        with pytest.raises(ReturnError) as exc:
            give_back(world, sale, 1)
        assert exc.value.code == "exceeds_sold"
        # Two returns refunded exactly the line total, no rounding drift.
        assert sum(r.total for r in SaleReturn.objects.all()) == Decimal("25000")


def test_same_key_twice_records_one_return(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)
        with_shift(world)
        sale = sell(world, item, boxes=2)
        key = str(uuid.uuid4())
        first = give_back(world, sale, 1, key=key)
        assert give_back(world, sale, 1, key=key) == first
        assert SaleReturn.objects.count() == 1


def test_quarantined_stock_is_not_sold(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=1)
        with_shift(world)
        sale = sell(world, item, boxes=1)
        give_back(world, sale, 1)
        assert on(item.pk, Location.Kind.QUARANTINE) == 14
        with pytest.raises(SaleError) as exc:
            post_sale(
                device=world.counter,
                user=world.cashier,
                lines=[line(item)],
                payments=[PaymentRequest("cash", Decimal("12500"))],
                customer_id=None,
                can_discount=False,
                idempotency_key=str(uuid.uuid4()),
            )
        assert exc.value.code == "insufficient_stock"


def test_credit_sale_is_refunded_to_the_account(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=2)
        with_shift(world)
        customer = Customer.objects.create(
            code="C1", name_ar="عميل", name_en="Client", credit_limit=Decimal("100000")
        )
        sale = sell(
            world,
            item,
            boxes=2,
            payments=[PaymentRequest("credit", Decimal("25000"))],
            customer_id=customer.pk,
        )
        customer.refresh_from_db()
        assert customer.balance == Decimal("25000")
        give_back(world, sale, 1, refund="account")
        customer.refresh_from_db()
        assert customer.balance == Decimal("12500")
        with pytest.raises(ReturnError):
            give_back(world, sell(world, stocked(world, code="X", boxes=1), 1), 1, refund="account")


def test_cash_refund_needs_an_open_shift(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=1)
        with_shift(world)
        sale = sell(world, item, boxes=1)
        Shift.objects.update(status=Shift.Status.CLOSED)
        with pytest.raises(ReturnError) as exc:
            give_back(world, sale, 1)
        assert exc.value.code == "shift_closed"
