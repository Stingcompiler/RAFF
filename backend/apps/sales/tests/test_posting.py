from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.db.models import Sum

from apps.finance.models import Customer, JournalLine, PartyLedgerEntry
from apps.inventory.models import Batch, StockMovement
from apps.sales.models import Payment, Sale, SaleAllocation, Shift
from apps.sales.services.posting import PaymentRequest, SaleError, post_sale
from apps.sales.services.pricing import PricingError, quote
from apps.sales.services.shifts import close_shift
from apps.sync.models import IdempotencyRecord
from apps.sync.services.idempotency import KeyConflict
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import add_batch, line, stocked, with_shift


def sell(
    world: World,
    lines: list[Any],
    payments: list[PaymentRequest] | None = None,
    key: str | None = None,
    **kw: Any,
) -> dict[str, Any]:
    total = kw.pop("total", None)
    return post_sale(
        device=world.counter,
        user=world.cashier,
        lines=lines,
        payments=payments
        or [PaymentRequest("cash", Decimal(total or "12500"), tendered=Decimal("20000"))],
        customer_id=kw.pop("customer_id", None),
        can_discount=kw.pop("can_discount", False),
        idempotency_key=key or str(uuid.uuid4()),
    )


def test_cash_sale_posts_everything_balanced(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world)
        with_shift(world)
        result = sell(world, [line(item)])
        sale = Sale.objects.get(pk=result["id"])
        assert result["number"] == "INV-000001"
        assert result["change"] == "7500.0000"
        assert sale.total == Decimal("12500.0000")
        assert sale.cost_total == Decimal("9800.0000")
        moves = StockMovement.objects.filter(document_id=sale.pk)
        assert sum(m.quantity_base for m in moves) == -14
        lines = JournalLine.objects.filter(entry__document_id=sale.pk)
        assert lines.aggregate(d=Sum("debit"))["d"] == lines.aggregate(c=Sum("credit"))["c"]


def test_server_prices_and_discount_rules(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world)
        with_shift(world)
        with pytest.raises(PricingError, match="discount_not_allowed"):
            sell(world, [line(item, discount_pct=Decimal(10))])
        with pytest.raises(PricingError, match="discount_too_high"):
            sell(world, [line(item, discount_pct=Decimal(50))], can_discount=True)
        result = sell(
            world, [line(item, discount_pct=Decimal(10))], total="11250", can_discount=True
        )
        assert result["total"] == "11250.0000"


def test_payments_must_equal_the_server_total(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world)
        with_shift(world)
        with pytest.raises(SaleError, match="payments_do_not_match_total"):
            sell(world, [line(item)], [PaymentRequest("cash", Decimal("100"))])
        with pytest.raises(SaleError, match="tendered_too_low"):
            sell(
                world,
                [line(item)],
                [PaymentRequest("cash", Decimal("12500"), tendered=Decimal("10000"))],
            )
        with pytest.raises(SaleError, match="bank_reference_required"):
            sell(world, [line(item)], [PaymentRequest("bank", Decimal("12500"))])
        result = sell(
            world,
            [line(item)],
            [
                PaymentRequest("cash", Decimal("10000")),
                PaymentRequest("bank", Decimal("2500"), bank_reference="BK-77121"),
            ],
        )
        payments = {p.method: p for p in Payment.objects.filter(sale_id=result["id"])}
        assert payments["bank"].verification == "pending"
        assert payments["cash"].amount == Decimal("10000")


def test_credit_sale_respects_the_limit_and_books_the_receivable(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)
        with_shift(world)
        clinic = Customer.objects.create(
            code="AMAL", name_ar="الأمل", name_en="Al-Amal", credit_limit=Decimal("20000")
        )
        with pytest.raises(SaleError, match="customer_required"):
            sell(world, [line(item)], [PaymentRequest("credit", Decimal("12500"))])
        sell(
            world, [line(item)], [PaymentRequest("credit", Decimal("12500"))], customer_id=clinic.pk
        )
        clinic.refresh_from_db()
        assert clinic.balance == Decimal("12500")
        assert PartyLedgerEntry.objects.get(party_id=clinic.pk).balance_after == Decimal("12500")
        from apps.finance.services.ledger import CreditLimitExceeded

        with pytest.raises(CreditLimitExceeded):
            sell(
                world,
                [line(item)],
                [PaymentRequest("credit", Decimal("12500"))],
                customer_id=clinic.pk,
            )


def test_fefo_takes_nearest_expiry_and_skips_expired(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=1, batch="LATE", expiry=dt.date(2031, 1, 1))
        add_batch(world, item, boxes=1, batch="SOON", expiry=dt.date(2027, 1, 1))
        add_batch(world, item, boxes=5, batch="OLD", expiry=dt.date(2026, 1, 1))  # already expired
        with_shift(world)
        tabs = [line(item, 20, unit="tab")]
        total = quote(
            tabs, can_discount=False
        ).total  # 20 tablets at 12,500 / 14, priced by the server
        result = sell(world, tabs, [PaymentRequest("cash", total)])
        allocations = SaleAllocation.objects.filter(line__sale_id=result["id"]).order_by(
            "batch__expiry_date"
        )
        assert [(a.batch.batch_no, a.base_quantity) for a in allocations] == [
            ("SOON", 14),
            ("LATE", 6),
        ]
        with pytest.raises(SaleError, match="insufficient_stock"):
            more = [line(item, 9, unit="tab")]
            sell(world, more, [PaymentRequest("cash", quote(more, can_discount=False).total)])


def test_chosen_batch_is_respected(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=1, batch="A", expiry=dt.date(2027, 1, 1))
        add_batch(world, item, boxes=1, batch="B", expiry=dt.date(2030, 1, 1))
        with_shift(world)
        b = Batch.objects.get(item=item, batch_no="B")
        result = sell(world, [line(item, batch_id=b.pk)])
        assert SaleAllocation.objects.get(line__sale_id=result["id"]).batch_id == b.pk


def test_same_key_replays_and_different_payload_conflicts(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=3)
        with_shift(world)
        key = str(uuid.uuid4())
        first = sell(world, [line(item)], key=key)
        again = sell(world, [line(item)], key=key)
        assert first == again
        assert Sale.objects.count() == 1
        with pytest.raises(KeyConflict):
            sell(world, [line(item, 2)], [PaymentRequest("cash", Decimal("25000"))], key=key)


def test_failure_mid_posting_leaves_nothing_and_retry_succeeds(
    world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    with org_context(world.org.id):
        item = stocked(world)
        with_shift(world)
        key = str(uuid.uuid4())
        from apps.sales.services import posting

        def boom(**_: object) -> None:
            raise ConnectionError("lost the server mid-approval")

        monkeypatch.setattr(posting, "post_journal", boom)
        with pytest.raises(ConnectionError):
            sell(world, [line(item)], key=key)
        assert not Sale.objects.exists()
        assert not StockMovement.objects.filter(kind="sale").exists()
        assert not IdempotencyRecord.objects.filter(key=key).exists()
        monkeypatch.undo()
        assert sell(world, [line(item)], key=key)["number"] == "INV-000001"


def test_no_sale_without_an_open_shift(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world)
        with pytest.raises(SaleError, match="shift_closed"):
            sell(world, [line(item)])


def test_close_shift_counts_cash_and_books_the_variance(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world)
        with_shift(world)
        sell(world, [line(item)])
        shift = Shift.objects.get(device=world.counter)
        result = close_shift(
            shift.pk, Decimal("61000"), idempotency_key=str(uuid.uuid4()), user=world.cashier
        )
        assert result["expected_cash"] == "62500.0000"
        assert result["variance"] == "-1500.0000"
        variance = JournalLine.objects.filter(
            entry__document_id=shift.pk, account__code="5200"
        ).get()
        assert variance.debit == Decimal("1500")
        with pytest.raises(SaleError, match="shift_closed"):
            sell(world, [line(item)])
