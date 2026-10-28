"""Staff move an order through its statuses. 'completed' is reached only from the POS
when the order becomes a sale (WO-09), never by hand."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.finance.money import money
from apps.notifications.services.notify import mark_read
from apps.orders.models import Order, OrderEvent
from apps.orders.services import payments

S = Order.Status
TRANSITIONS: dict[str, set[str]] = {
    S.NEW: {S.NEEDS_CONTACT, S.CONFIRMED, S.CANCELLED},
    S.NEEDS_CONTACT: {S.CONFIRMED, S.CANCELLED},
    S.CONFIRMED: {S.PREPARING, S.CANCELLED},
    S.PREPARING: {S.READY, S.CANCELLED},
    S.READY: {S.CANCELLED},
}
NEEDS_REASON = {S.NEEDS_CONTACT, S.CANCELLED}
EDITABLE = {S.NEW, S.NEEDS_CONTACT}


class WorkflowError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def allowed(order: Order) -> list[str]:
    return sorted(TRANSITIONS.get(order.status, set()))


def _hooks() -> Any:
    """Reservation hooks from WO-09 (confirm reserves, cancel releases)."""
    try:
        import importlib

        return importlib.import_module("apps.orders.services.reserving")
    except ImportError:  # before WO-09
        return None


@transaction.atomic
def transition(order_id: uuid.UUID, to: str, reason: str, user: User) -> Order:
    order: Order = Order.objects.select_for_update().get(pk=order_id)
    if to not in TRANSITIONS.get(order.status, set()):
        raise WorkflowError("transition_not_allowed")
    if to in NEEDS_REASON and not reason.strip():
        raise WorkflowError("reason_required")
    prepaid_unverified = (
        order.payment_method == Order.PaymentMethod.BANK
        and order.payment_status != Order.PaymentStatus.VERIFIED
    )
    if to == S.PREPARING and prepaid_unverified and not reason.strip():
        # Preparing a prepaid order before the transfer is verified is a recorded decision.
        raise WorkflowError("payment_not_verified")
    hooks = _hooks()
    automatic = ""
    if hooks is not None:
        to, automatic = hooks.on_transition(order, to, user)
    order.status = to
    reason = automatic or reason
    if to in NEEDS_REASON or reason.strip():
        order.reason = reason.strip()[:300]
    if order.assigned_to_id is None:
        order.assigned_to = user
    order.save(update_fields=["status", "reason", "assigned_to", "updated_at"])
    OrderEvent.objects.create(order=order, status=to, actor=user, note=reason.strip()[:300])
    if to == S.PREPARING and prepaid_unverified:
        payments.override_note(order, user, reason)
    if to == S.CANCELLED:
        payments.on_cancel(order, user)
    mark_read(order.pk)
    record("status", "order", order.pk, actor=user, branch=order.branch, to=to)
    return order


@transaction.atomic
def edit_lines(order_id: uuid.UUID, quantities: dict[str, int], consent: str, user: User) -> Order:
    """Change quantities (0 removes a line) after the customer agreed (consent is recorded)."""
    order: Order = Order.objects.select_for_update().get(pk=order_id)
    if order.status not in EDITABLE:
        raise WorkflowError("not_editable")
    if not consent.strip():
        raise WorkflowError("consent_required")
    lines = {str(li.pk): li for li in order.lines.all()}
    for line_id, qty in quantities.items():
        line = lines.get(line_id)
        if line is None or qty < 0 or qty > 20:
            raise WorkflowError("invalid_line")
        if qty == 0:
            line.delete()
            del lines[line_id]
        else:
            line.quantity = qty
            line.save(update_fields=["quantity"])
    if not lines:
        raise WorkflowError("no_lines")
    order.estimated_total = money(
        sum(
            (li.published_price * li.quantity for li in lines.values() if li.published_price),
            Decimal(0),
        )
    )
    order.save(update_fields=["estimated_total", "updated_at"])
    OrderEvent.objects.create(order=order, status=order.status, actor=user, note=consent[:300])
    record("edit", "order", order.pk, actor=user, branch=order.branch, consent=consent[:300])
    return order


def set_internal_note(order_id: uuid.UUID, note: str, user: User) -> Order:
    order: Order = Order.objects.get(pk=order_id)
    order.internal_note = note[:2000]
    order.save(update_fields=["internal_note", "updated_at"])
    return order
