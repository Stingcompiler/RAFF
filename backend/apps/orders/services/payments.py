"""Paying a store order by bank transfer before pickup (D-R0021).

The customer sends the transfer's reference and amount; staff check them against the bank
and verify or reject. Nothing here moves money or posts a ledger entry: the verified payment
becomes the sale's bank payment when the order is turned into a sale at the counter.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.finance.money import money
from apps.notifications.services.notify import mark_read, payment_submitted
from apps.orders.models import Order, OrderPaymentEvent
from apps.sales.models import Payment
from apps.storefront.models import StorefrontSettings

P = Order.PaymentStatus
K = OrderPaymentEvent.Kind
MAX_AMOUNT = Decimal("100000000")
MIN_REFERENCE = 4
# Statuses where the customer can still send (or resend) the transfer's details.
SENDABLE = {P.AWAITING_PROOF, P.REJECTED}
CLOSED_ORDER = {Order.Status.CANCELLED, Order.Status.COMPLETED}


class PaymentError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def normalize_reference(raw: str) -> str:
    """The same transfer typed with spaces or lower case is the same reference."""
    return re.sub(r"\s+", "", raw).upper()[:60]


def check_details(reference: str, amount: Decimal | None) -> tuple[str, Decimal]:
    ref = normalize_reference(reference)
    if len(ref) < MIN_REFERENCE or not re.fullmatch(r"[\w\-/.]+", ref):
        raise PaymentError("invalid_reference")
    if amount is None or amount <= 0 or amount > MAX_AMOUNT:
        raise PaymentError("invalid_amount")
    return ref, money(amount)


def reference_in_use(ref: str, exclude: Order | None = None) -> bool:
    taken = Order.objects.filter(
        payment_reference=ref,
        payment_status__in=[P.SUBMITTED, P.VERIFIED, P.REFUND_DUE, P.REFUNDED],
    )
    if exclude is not None:
        taken = taken.exclude(pk=exclude.pk)
    counter = Payment.objects.filter(
        method=Payment.Method.BANK, bank_reference__iexact=ref
    ).exists()
    return taken.exists() or counter


def _event(
    order: Order, kind: str, actor: User | None, amount: Decimal | None = None, note: str = ""
) -> None:
    OrderPaymentEvent.objects.create(
        order=order, kind=kind, actor=actor, amount=amount, note=note.strip()[:300]
    )


def apply_submission(order: Order, ref: str, amount: Decimal) -> None:
    """Record the customer's transfer details on an order (caller holds the lock)."""
    if reference_in_use(ref, exclude=order):
        raise PaymentError("reference_used")
    order.payment_reference = ref
    order.paid_amount = amount
    order.payment_status = P.SUBMITTED
    order.payment_submitted_at = timezone.now()
    order.payment_note = ""
    order.save(
        update_fields=[
            "payment_reference",
            "paid_amount",
            "payment_status",
            "payment_submitted_at",
            "payment_note",
            "updated_at",
        ]
    )
    _event(order, K.SUBMITTED, None, amount)
    chat = (StorefrontSettings.objects.first() or StorefrontSettings()).telegram_chat_id
    payment_submitted(order.pk, f"{order.number} · {order.customer_name} · {amount}", chat)


@transaction.atomic
def submit_payment(order_id: Any, reference: str, amount: Decimal | None) -> Order:
    """The customer sends the transfer's details after the order (before or after confirming)."""
    order: Order = Order.objects.select_for_update().get(pk=order_id)
    if order.payment_method != Order.PaymentMethod.BANK:
        raise PaymentError("not_prepaid")
    if order.status in CLOSED_ORDER:
        raise PaymentError("order_closed")
    if order.payment_status not in SENDABLE:
        raise PaymentError("payment_not_open")
    ref, value = check_details(reference, amount)
    apply_submission(order, ref, value)
    return order


def _locked(order_id: Any) -> Order:
    order: Order = Order.objects.select_for_update().get(pk=order_id)
    return order


@transaction.atomic
def verify(order_id: Any, actor: User) -> Order:
    order = _locked(order_id)
    if order.payment_status != P.SUBMITTED:
        raise PaymentError("nothing_to_verify")
    order.payment_status = P.VERIFIED
    order.payment_verified_at = timezone.now()
    order.payment_verified_by = actor
    order.save(
        update_fields=["payment_status", "payment_verified_at", "payment_verified_by", "updated_at"]
    )
    _event(order, K.VERIFIED, actor, order.paid_amount)
    mark_read(order.pk)
    record("payment_verify", "order", order.pk, actor=actor, branch=order.branch)
    return order


@transaction.atomic
def reject(order_id: Any, actor: User, note: str) -> Order:
    order = _locked(order_id)
    if order.payment_status != P.SUBMITTED:
        raise PaymentError("nothing_to_verify")
    if not note.strip():
        raise PaymentError("reason_required")
    order.payment_status = P.REJECTED
    order.payment_note = note.strip()[:300]
    order.save(update_fields=["payment_status", "payment_note", "updated_at"])
    _event(order, K.REJECTED, actor, order.paid_amount, note)
    mark_read(order.pk)
    record("payment_reject", "order", order.pk, actor=actor, branch=order.branch)
    return order


@transaction.atomic
def mark_refunded(order_id: Any, actor: User, note: str) -> Order:
    """The pharmacy sent the money back; the note carries the refund transfer's reference."""
    order = _locked(order_id)
    if order.payment_status != P.REFUND_DUE:
        raise PaymentError("no_refund_due")
    if not note.strip():
        raise PaymentError("reason_required")
    order.payment_status = P.REFUNDED
    order.payment_note = note.strip()[:300]
    order.save(update_fields=["payment_status", "payment_note", "updated_at"])
    _event(order, K.REFUNDED, actor, order.paid_amount, note)
    record("payment_refund", "order", order.pk, actor=actor, branch=order.branch)
    return order


def on_cancel(order: Order, actor: User) -> None:
    """Cancelling an order whose transfer was sent leaves a refund to settle by hand."""
    if order.payment_status in (P.SUBMITTED, P.VERIFIED):
        order.payment_status = P.REFUND_DUE
        order.save(update_fields=["payment_status", "updated_at"])
        _event(order, K.REFUND_DUE, actor, order.paid_amount, "order cancelled")
    elif order.payment_status == P.AWAITING_PROOF:
        order.payment_status = P.NONE
        order.save(update_fields=["payment_status", "updated_at"])


def override_note(order: Order, actor: User, reason: str) -> None:
    _event(order, K.OVERRIDE, actor, note=reason)


def overpaid(order: Order, total: Decimal, actor: User | None) -> None:
    """A sale smaller than the verified transfer leaves the difference to refund."""
    if order.paid_amount is not None and order.paid_amount > total:
        order.payment_status = P.REFUND_DUE
        order.save(update_fields=["payment_status", "updated_at"])
        _event(order, K.REFUND_DUE, actor, money(order.paid_amount - total), "sale below payment")
