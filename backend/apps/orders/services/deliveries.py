"""Home delivery by a courier (D-R0023).

Staff assign a ready order to a courier; the courier picks it up, then reports it delivered
(with the cash collected, if the customer pays at the door) or failed. The sale is posted later,
at the counter, when the courier hands the cash over (`delivered` → `completed` is the POS's
move, like `ready` → `completed` for a pickup): stock stays reserved until then.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import RoleAssignment, User
from apps.audit.services.log import record
from apps.finance.money import money
from apps.orders.models import Order, OrderEvent

S = Order.Status
MAX_COLLECTED = Decimal("100000000")


class DeliveryError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def couriers_for(branch_id: Any) -> list[User]:
    """Active users holding `deliveries.handle` for this branch (or for every branch)."""
    from django.db.models import Q

    rows = RoleAssignment.objects.filter(
        Q(branch_id=branch_id) | Q(branch__isnull=True)
    ).select_related("user", "role")
    found: dict[uuid.UUID, User] = {}
    for row in rows:
        if "deliveries.handle" in row.role.permissions and row.user.is_active:
            found[row.user.pk] = row.user
    return sorted(found.values(), key=lambda u: u.username)


def _event(order: Order, to: str, actor: User, note: str = "") -> None:
    OrderEvent.objects.create(order=order, status=to, actor=actor, note=note.strip()[:300])


def _locked(order_id: Any) -> Order:
    order: Order = Order.objects.select_for_update().get(pk=order_id)
    return order


@transaction.atomic
def assign(order_id: Any, courier_id: Any, actor: User) -> Order:
    """Give a ready home-delivery order to a courier (staff; can be changed while ready)."""
    order = _locked(order_id)
    if order.fulfillment != Order.Fulfillment.DELIVERY:
        raise DeliveryError("not_a_delivery")
    if order.status != S.READY:
        raise DeliveryError("order_not_ready")
    courier = next((u for u in couriers_for(order.branch_id) if u.pk == courier_id), None)
    if courier is None:
        raise DeliveryError("unknown_courier")
    order.courier = courier
    order.save(update_fields=["courier", "updated_at"])
    _event(order, S.READY, actor, f"courier:{courier.username}")
    record(
        "assign_courier",
        "order",
        order.pk,
        actor=actor,
        branch=order.branch,
        courier=courier.username,
    )
    return order


def _mine(order: Order, courier: User) -> None:
    if order.courier_id != courier.pk:
        raise DeliveryError("not_yours")


@transaction.atomic
def pick_up(order_id: Any, courier: User) -> Order:
    order = _locked(order_id)
    _mine(order, courier)
    if order.status != S.READY:
        raise DeliveryError("transition_not_allowed")
    order.status = S.OUT_FOR_DELIVERY
    order.save(update_fields=["status", "updated_at"])
    _event(order, S.OUT_FOR_DELIVERY, courier)
    return order


@transaction.atomic
def deliver(order_id: Any, courier: User, collected: Decimal | None, note: str = "") -> Order:
    """The courier handed the order over. Cash paid at the door is recorded; a prepaid order
    collects nothing."""
    order = _locked(order_id)
    _mine(order, courier)
    if order.status != S.OUT_FOR_DELIVERY:
        raise DeliveryError("transition_not_allowed")
    if order.payment_method == Order.PaymentMethod.COD:
        if collected is None or collected < 0 or collected > MAX_COLLECTED:
            raise DeliveryError("collected_required")
        order.collected_amount = money(collected)
    elif collected not in (None, Decimal(0)):
        raise DeliveryError("prepaid_collects_nothing")
    order.status = S.DELIVERED
    order.delivered_at = timezone.now()
    order.save(update_fields=["status", "delivered_at", "collected_amount", "updated_at"])
    _event(order, S.DELIVERED, courier, note)
    record("delivered", "order", order.pk, actor=courier, branch=order.branch)
    return order


@transaction.atomic
def fail(order_id: Any, courier: User, reason: str) -> Order:
    order = _locked(order_id)
    _mine(order, courier)
    if order.status != S.OUT_FOR_DELIVERY:
        raise DeliveryError("transition_not_allowed")
    if not reason.strip():
        raise DeliveryError("reason_required")
    order.status = S.DELIVERY_FAILED
    order.reason = reason.strip()[:300]
    order.save(update_fields=["status", "reason", "updated_at"])
    _event(order, S.DELIVERY_FAILED, courier, reason)
    record("delivery_failed", "order", order.pk, actor=courier, branch=order.branch)
    return order
