"""Reservations (WO-09): confirming an order holds its units on the shelf, inside the same
ordered locks as a counter sale (LOCKING.md steps 3-4), so the last unit is sold once."""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any

from apps.accounts.models import User
from apps.orders.models import Order, StockReservation

S = Order.Status


def lock_reservations(
    branch_id: uuid.UUID, item_ids: set[uuid.UUID] | list[uuid.UUID]
) -> list[StockReservation]:
    """LOCKING.md step 4: active reservations of these items, ordered by (item_id, id)."""
    return list(
        StockReservation.objects.select_for_update()
        .filter(branch_id=branch_id, item_id__in=item_ids, status=StockReservation.Status.ACTIVE)
        .order_by("item_id", "id")
    )


def held_by_batch(
    reservations: list[StockReservation], *, exclude_order: uuid.UUID | None = None
) -> dict[uuid.UUID, int]:
    out: dict[uuid.UUID, int] = defaultdict(int)
    for r in reservations:
        if r.order_id != exclude_order:
            out[r.batch_id] += r.quantity_base
    return out


def reserve(order: Order) -> tuple[str, str]:
    """Hold every line FEFO; on any shortage hold nothing and ask for contact instead."""
    from apps.sales.services.posting import lock_candidates

    lines = list(order.lines.select_related("unit"))
    item_ids = {li.item_id for li in lines}
    candidates = lock_candidates(order.branch_id, item_ids)
    held = held_by_batch(lock_reservations(order.branch_id, item_ids), exclude_order=order.pk)
    plan: list[tuple[Any, Any, int]] = []
    short = []
    used: dict[uuid.UUID, int] = defaultdict(int)
    for line in lines:
        need = line.quantity * line.unit.factor
        for balance in candidates.get(line.item_id, []):
            free = balance.quantity_base - held[balance.batch_id] - used[balance.batch_id]
            take = min(need, free)
            if take > 0:
                plan.append((line, balance.batch, take))
                used[balance.batch_id] += take
                need -= take
            if need == 0:
                break
        if need:
            short.append(line.item.code)
    if short:
        return S.NEEDS_CONTACT, "shortage: " + ", ".join(short)
    StockReservation.objects.filter(order=order, status=StockReservation.Status.ACTIVE).update(
        status=StockReservation.Status.RELEASED
    )
    StockReservation.objects.bulk_create(
        [
            StockReservation(
                branch_id=order.branch_id,
                order=order,
                line=line,
                item_id=line.item_id,
                batch=batch,
                quantity_base=qty,
                organization_id=order.organization_id,
            )
            for line, batch, qty in plan
        ]
    )
    return S.CONFIRMED, ""


def release(order: Order) -> None:
    StockReservation.objects.filter(order=order, status=StockReservation.Status.ACTIVE).update(
        status=StockReservation.Status.RELEASED
    )


def on_transition(order: Order, to: str, user: User) -> tuple[str, str]:
    """Called by workflow.transition under the order's lock. Returns (status, automatic reason)."""
    del user
    if to == S.CONFIRMED:
        return reserve(order)
    if to == S.CANCELLED:
        release(order)
    return to, ""
