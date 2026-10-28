"""post_sale: one atomic, idempotent posting (CLAUDE.md rule 6, LOCKING.md)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.finance.models import Customer
from apps.finance.money import money
from apps.finance.services.ledger import charge_customer, post_journal
from apps.inventory.models import Batch, Location, StockBalance, StockMovement
from apps.inventory.services.stock import Move, apply_movements, location
from apps.sales.models import Payment, Sale, SaleAllocation, SaleLine, Shift
from apps.sales.services.pricing import LineRequest, PricedLine, quote
from apps.sync.services.idempotency import run_once
from apps.sync.services.sequences import next_number
from apps.tenancy import clock
from apps.tenancy.models import Device


class SaleError(Exception):
    def __init__(self, code: str, **detail: object) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class PaymentRequest:
    method: str
    amount: Decimal
    tendered: Decimal | None = None
    bank_reference: str = ""
    bank_account: str = ""


def lock_candidates(
    branch_id: uuid.UUID, item_ids: set[uuid.UUID]
) -> dict[uuid.UUID, list[StockBalance]]:
    """Lock every sellable, unexpired balance of these items in one ordered statement
    (LOCKING.md step 3), so two sales with the same items never deadlock."""
    rows = list(
        StockBalance.objects.select_for_update(of=("self",))
        .select_related("batch")
        .filter(
            branch_id=branch_id,
            item_id__in=item_ids,
            location__kind=Location.Kind.SELLABLE,
            quantity_base__gt=0,
            batch__expiry_date__gte=clock.today(),
        )
        .order_by("branch_id", "item_id", "batch_id", "location_id")
    )
    by_item: dict[uuid.UUID, list[StockBalance]] = {}
    for row in rows:
        by_item.setdefault(row.item_id, []).append(row)
    for balances in by_item.values():
        balances.sort(key=lambda b: (b.batch.expiry_date, b.batch.batch_no))  # FEFO
    return by_item


def allocate(
    line: PricedLine, candidates: list[StockBalance], used: dict[uuid.UUID, int]
) -> list[tuple[Batch, int]]:
    """FEFO over the locked balances (or only the chosen batch)."""
    need = line.base_quantity
    taken: list[tuple[Batch, int]] = []
    for b in candidates:
        if line.batch_id and b.batch_id != line.batch_id:
            continue
        free = b.quantity_base - used.get(b.pk, 0)
        if need == 0 or free <= 0:
            continue
        q = min(need, free)
        used[b.pk] = used.get(b.pk, 0) + q
        taken.append((b.batch, q))
        need -= q
    if need:
        raise SaleError(
            "insufficient_stock", line=line.line_no, available=line.base_quantity - need
        )
    return taken


def _prepaid_reference(order: Any, total: Decimal, payments: list[PaymentRequest]) -> str:
    """A verified bank transfer for this order must be what pays the sale (D-R0021): the
    sale's bank payment carries the transfer's reference and covers what was transferred, up
    to the total. A transfer still awaiting verification is settled first, never worked round."""
    if order is None or order.payment_method != "bank":
        return ""
    if order.payment_status == "submitted":
        raise SaleError("payment_unverified")
    if order.payment_status != "verified":
        return ""
    from apps.orders.services.payments import normalize_reference

    due = money(min(order.paid_amount or Decimal(0), total))
    applied = money(
        sum(
            (
                money(p.amount)
                for p in payments
                if p.method == Payment.Method.BANK
                and normalize_reference(p.bank_reference) == order.payment_reference
            ),
            Decimal(0),
        )
    )
    if applied != due:
        raise SaleError("prepaid_mismatch")
    return str(order.payment_reference)


def _payments(
    total: Decimal, payments: list[PaymentRequest], customer: Customer | None
) -> list[PaymentRequest]:
    if not payments:
        raise SaleError("no_payment")
    if sum(money(p.amount) for p in payments) != total:
        raise SaleError("payments_do_not_match_total")
    for p in payments:
        if p.method not in Payment.Method.values or p.amount <= 0:
            raise SaleError("invalid_payment")
        if p.method == Payment.Method.CASH and p.tendered is not None and p.tendered < p.amount:
            raise SaleError("tendered_too_low")
        if p.method == Payment.Method.BANK and not p.bank_reference.strip():
            raise SaleError("bank_reference_required")
        if p.method == Payment.Method.CREDIT and customer is None:
            raise SaleError("customer_required")
    return payments


def _order_allocations(order: Any, priced: list[PricedLine]) -> list[list[tuple[Batch, int]]]:
    """An order's sale takes exactly the batches its reservations hold."""
    from apps.orders.models import StockReservation

    wanted = sorted((li.item_id, li.unit_id, li.quantity) for li in order.lines.all())
    asked = sorted((li.item.pk, li.unit.pk, li.quantity) for li in priced)
    if wanted != asked:
        raise SaleError("order_lines_changed")
    held: dict[uuid.UUID, list[StockReservation]] = {}
    for r in order.reservations.filter(status=StockReservation.Status.ACTIVE).select_related(
        "batch"
    ):
        held.setdefault(r.item_id, []).append(r)
    out = []
    for line in priced:
        taken = []
        need = line.base_quantity
        for r in held.get(line.item.pk, []):
            q = min(need, r.quantity_base)
            if q > 0:
                taken.append((r.batch, q))
                r.quantity_base -= q
                need -= q
        if need:
            raise SaleError("order_not_reserved", line=line.line_no)
        out.append(taken)
    return out


def _complete_order(order: Any, sale: Sale, user: User) -> None:
    from apps.orders.models import Order, OrderEvent, OrderInvoiceLink, StockReservation

    StockReservation.objects.filter(order=order, status=StockReservation.Status.ACTIVE).update(
        status=StockReservation.Status.CONSUMED
    )
    OrderInvoiceLink.objects.create(order=order, sale=sale)
    if order.payment_method == Order.PaymentMethod.BANK and order.payment_status == "verified":
        from apps.orders.services.payments import overpaid

        overpaid(order, sale.total, user)
    order.status = Order.Status.COMPLETED
    order.save(update_fields=["status", "updated_at"])
    OrderEvent.objects.create(order=order, status=order.status, actor=user, note=sale.number)


def _post(
    *,
    device: Device,
    user: User,
    lines: list[LineRequest],
    payments: list[PaymentRequest],
    customer_id: uuid.UUID | None,
    can_discount: bool,
    key: str,
    order: Any = None,
) -> dict[str, Any]:
    branch = device.branch
    shift = Shift.objects.filter(device=device, status=Shift.Status.OPEN).first()
    if shift is None:
        raise SaleError("shift_closed")
    customer = (
        Customer.objects.filter(pk=customer_id, is_active=True).first() if customer_id else None
    )
    if customer_id and customer is None:
        raise SaleError("unknown_customer")
    q = quote(lines, can_discount=can_discount)
    payments = _payments(q.total, payments, customer)
    prepaid = _prepaid_reference(order, q.total, payments)

    from apps.orders.services.reserving import held_by_batch, lock_reservations

    if order is not None and (order.status != "ready" or order.branch_id != branch.pk):
        raise SaleError("order_not_ready")
    number = next_number("sale", "INV")
    item_ids = {line.item.pk for line in q.lines}
    candidates = lock_candidates(branch.pk, item_ids)
    # Units held for confirmed storefront orders are not for sale at the counter.
    held = held_by_batch(
        lock_reservations(branch.pk, item_ids), exclude_order=order.pk if order else None
    )
    used: dict[uuid.UUID, int] = {
        b.pk: held.get(b.batch_id, 0) for balances in candidates.values() for b in balances
    }
    if order is not None:
        allocations = list(zip(q.lines, _order_allocations(order, q.lines), strict=True))
    else:
        allocations = [
            (line, allocate(line, candidates.get(line.item.pk, []), used)) for line in q.lines
        ]
    shelf = location(branch, Location.Kind.SELLABLE)
    sale = Sale(
        number=number,
        branch=branch,
        device=device,
        shift=shift,
        customer=customer,
        subtotal=q.subtotal,
        discount_total=q.discount_total,
        total=q.total,
        cost_total=Decimal(0),
        idempotency_key=key,
        created_by=user,
    )
    sale.save()
    moves = [
        Move(shelf, batch, -qty, batch.unit_cost)
        for _, taken in allocations
        for batch, qty in taken
    ]
    apply_movements(
        branch,
        moves,
        kind=StockMovement.Kind.SALE,
        document_type="sale",
        document_id=sale.pk,
        user=user,
    )

    cost_total = Decimal(0)
    for line, taken in allocations:
        line_cost = money(sum((batch.unit_cost * qty for batch, qty in taken), Decimal(0)))
        cost_total += line_cost
        row = SaleLine.objects.create(
            sale=sale,
            line_no=line.line_no,
            item=line.item,
            unit=line.unit,
            quantity=line.quantity,
            base_quantity=line.base_quantity,
            unit_price=line.unit_price,
            discount_pct=line.discount_pct,
            line_subtotal=line.line_subtotal,
            line_total=line.line_total,
            cost_total=line_cost,
        )
        SaleAllocation.objects.bulk_create(
            [
                SaleAllocation(
                    line=row,
                    batch=batch,
                    base_quantity=qty,
                    unit_cost=batch.unit_cost,
                    organization_id=sale.organization_id,
                )
                for batch, qty in taken
            ]
        )
    sale.cost_total = money(cost_total)
    sale.save(update_fields=["cost_total"])

    change = Decimal(0)
    debit_by_account: dict[str, Decimal] = {
        "1000": Decimal(0),
        "1020": Decimal(0),
        "1100": Decimal(0),
    }
    for p in payments:
        amount = money(p.amount)
        pay = Payment(sale=sale, method=p.method, amount=amount)
        if p.method == Payment.Method.CASH:
            pay.tendered = money(p.tendered) if p.tendered is not None else amount
            pay.change = money(pay.tendered - amount)
            change += pay.change
            debit_by_account["1000"] += amount
        elif p.method == Payment.Method.BANK:
            pay.bank_reference = p.bank_reference.strip()
            pay.bank_account = p.bank_account.strip()
            from apps.orders.services.payments import normalize_reference

            # The customer's own transfer was verified before preparing; others wait for the
            # shift close like every counter transfer.
            pay.verification = (
                Payment.Verification.CONFIRMED
                if prepaid and normalize_reference(pay.bank_reference) == prepaid
                else Payment.Verification.PENDING
            )
            debit_by_account["1020"] += amount
        else:
            assert customer is not None
            charge_customer(customer, amount, document_type="sale", document_id=sale.pk)
            debit_by_account["1100"] += amount
        pay.save()

    post_journal(
        branch=branch,
        date=clock.today(),
        document_type="sale",
        document_id=sale.pk,
        lines=[
            *[(code, amt, Decimal(0)) for code, amt in debit_by_account.items()],
            ("4000", Decimal(0), q.total),
            ("5000", sale.cost_total, Decimal(0)),
            ("1200", Decimal(0), sale.cost_total),
        ],
        memo=number,
    )
    # LOCKING.md step 6: the shift row last; a concurrent close waits or wins first.
    locked = Shift.objects.select_for_update().get(pk=shift.pk)
    if locked.status != Shift.Status.OPEN:
        raise SaleError("shift_closed")
    if order is not None:
        _complete_order(order, sale, user)
    record("post", "sale", sale.pk, actor=user, branch=branch, number=number, total=str(q.total))
    return {
        "id": str(sale.pk),
        "number": number,
        "total": str(q.total),
        "change": str(money(change)),
    }


def sale_payload(
    device: Device,
    customer_id: uuid.UUID | None,
    lines: list[LineRequest],
    payments: list[PaymentRequest],
    order_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """What an Idempotency-Key is bound to: the same key with a different cart is a 409."""
    return {
        "order": str(order_id) if order_id else None,
        "device": str(device.pk),
        "customer": str(customer_id) if customer_id else None,
        "lines": [
            [str(x.item_id), str(x.unit_id), x.quantity, str(x.discount_pct), str(x.batch_id)]
            for x in lines
        ],
        "payments": [
            [p.method, str(p.amount), str(p.tendered), p.bank_reference] for p in payments
        ],
    }


@transaction.atomic
def post_sale(
    *,
    device: Device,
    user: User,
    lines: list[LineRequest],
    payments: list[PaymentRequest],
    customer_id: uuid.UUID | None,
    can_discount: bool,
    idempotency_key: str | None,
    order_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    from apps.orders.models import Order

    # LOCKING.md step 1: an order being turned into a sale is the document.
    order = Order.objects.select_for_update().get(pk=order_id) if order_id else None
    payload = sale_payload(device, customer_id, lines, payments, order_id)
    key = idempotency_key or ""
    return run_once(
        "post_sale",
        idempotency_key,
        payload,
        lambda: _post(
            device=device,
            user=user,
            lines=lines,
            payments=payments,
            customer_id=customer_id,
            can_discount=can_discount,
            key=key,
            order=order,
        ),
    )
