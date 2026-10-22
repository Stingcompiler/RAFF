from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from apps.finance.models import Customer, JournalLine
from apps.finance.selectors import ledger
from apps.finance.services.ledger import supplier_balance
from apps.finance.services.payments import PaymentError, record_payment, verify_transfer
from apps.sales.models import Payment
from apps.sales.services.posting import PaymentRequest, post_sale
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import line, stocked, with_shift
from tests.stock import supplier

pytestmark = pytest.mark.django_db


def gl(document_id: object) -> set[tuple[str, Decimal, Decimal]]:
    return {
        (j.account.code, j.debit, j.credit)
        for j in JournalLine.objects.filter(entry__document_id=document_id)
    }


def test_collection_reduces_the_receivable(world: World) -> None:
    with org_context(world.org.id):
        customer = Customer.objects.create(
            code="C1", name_ar="ع", name_en="C", credit_limit=Decimal("100000"), balance=0
        )
        item = stocked(world, boxes=2)
        with_shift(world)
        post_sale(
            device=world.counter,
            user=world.cashier,
            lines=[line(item, 2)],
            payments=[PaymentRequest("credit", Decimal("25000"))],
            customer_id=customer.pk,
            can_discount=False,
            idempotency_key=str(uuid.uuid4()),
        )
        key = str(uuid.uuid4())
        args = dict(
            branch=world.khartoum,
            party_type="customer",
            party_id=customer.pk,
            method="cash",
            amount=Decimal("10000"),
            reference="",
            note="",
            idempotency_key=key,
            user=world.owner,
        )
        first = record_payment(**args)
        assert record_payment(**args) == first
        customer.refresh_from_db()
        assert customer.balance == Decimal("15000")
        assert gl(first["id"]) == {
            ("1000", Decimal("10000"), Decimal(0)),
            ("1100", Decimal(0), Decimal("10000")),
        }
        rows = ledger("customer", customer.pk)
        assert [r["document_type"] for r in rows] == ["party_payment", "sale"]
        assert rows[0]["credit"] == Decimal("10000") and rows[0]["balance"] == Decimal("15000")
        assert rows[1]["document_number"].startswith("INV-")


def test_supplier_payment_needs_a_reference_for_bank(world: World) -> None:
    with org_context(world.org.id):
        stocked(world, boxes=2)  # receipt: we owe the supplier 19,600
        nada = supplier()
        owed = supplier_balance(nada.pk)
        assert owed == Decimal("19600")
        with pytest.raises(PaymentError):
            record_payment(
                branch=world.khartoum,
                party_type="supplier",
                party_id=nada.pk,
                method="bank",
                amount=Decimal("5000"),
                reference="",
                note="",
                idempotency_key=str(uuid.uuid4()),
                user=world.owner,
            )
        record_payment(
            branch=world.khartoum,
            party_type="supplier",
            party_id=nada.pk,
            method="bank",
            amount=Decimal("5000"),
            reference="TRX-1",
            note="",
            idempotency_key=str(uuid.uuid4()),
            user=world.owner,
        )
        assert supplier_balance(nada.pk) == owed - 5000


def test_bank_transfer_is_confirmed_once(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=1)
        with_shift(world)
        post_sale(
            device=world.counter,
            user=world.cashier,
            lines=[line(item)],
            payments=[PaymentRequest("bank", Decimal("12500"), bank_reference="BK-1")],
            customer_id=None,
            can_discount=False,
            idempotency_key=str(uuid.uuid4()),
        )
        payment = Payment.objects.get(method="bank")
        assert payment.verification == "pending"
        verify_transfer(payment.pk, world.owner)
        verify_transfer(payment.pk, world.owner)
        payment.refresh_from_db()
        assert payment.verification == "confirmed"
        assert gl(payment.pk) == {
            ("1010", Decimal("12500"), Decimal(0)),
            ("1020", Decimal(0), Decimal("12500")),
        }


def test_verify_and_settle_over_the_api(world: World) -> None:
    from apps.returns.tests.test_api import owner_at
    from apps.sales.services.shifts import close_shift

    with org_context(world.org.id):
        item = stocked(world, boxes=1)
        with_shift(world)
        post_sale(
            device=world.counter,
            user=world.cashier,
            lines=[line(item)],
            payments=[PaymentRequest("bank", Decimal("12500"), bank_reference="BK-9")],
            customer_id=None,
            can_discount=False,
            idempotency_key=str(uuid.uuid4()),
        )
        payment = Payment.objects.get(method="bank")
        shift = payment.sale.shift
        close_shift(shift.pk, Decimal("49000"), idempotency_key=str(uuid.uuid4()), user=world.owner)
    client, csrf = owner_at(world, world.khartoum.pk)
    pending = client.get("/api/v1/finance/bank-transfers/").json()
    assert [p["bank_reference"] for p in pending] == ["BK-9"]
    done = client.post(f"/api/v1/finance/bank-transfers/{payment.pk}/verify/", **csrf)
    assert done.status_code == 200 and done.json()["verification"] == "confirmed"
    assert client.get("/api/v1/finance/bank-transfers/").json() == []
    log = client.get("/api/v1/shifts/history/").json()
    assert log[0]["settled"] is False and log[0]["shift"]["variance"] == "-1000.0000"
    settled = client.post(f"/api/v1/shifts/{shift.pk}/settle/", **csrf)
    assert settled.status_code == 200
    assert client.get("/api/v1/shifts/history/").json()[0]["settled"] is True
