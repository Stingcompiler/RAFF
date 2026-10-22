"""Stock movements and balances. See ../LOCKING.md for the lock order."""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from django.db import connection, transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.inventory.models import Batch, Location, StockBalance, StockMovement
from apps.tenancy.context import get_current_org_id
from apps.tenancy.models import Branch

DEFAULT_LOCATIONS = [
    (Location.Kind.SELLABLE, "shelf", "الرف", "Shelf"),
    (Location.Kind.REVIEW, "review", "محجوز للمراجعة", "Held for review"),
    (Location.Kind.QUARANTINE, "quarantine", "الحجر", "Quarantine"),
    (Location.Kind.TRANSIT, "transit", "قيد النقل", "In transit"),
]


class InsufficientStock(Exception):
    def __init__(self, item_id: uuid.UUID, available: int, requested: int) -> None:
        super().__init__(f"{item_id}: {available} < {requested}")
        self.item_id = item_id
        self.available = available
        self.requested = requested


def location(branch: Branch, kind: str) -> Location:
    """The branch's location of this kind (created on first use)."""
    for k, code, name_ar, name_en in DEFAULT_LOCATIONS:
        if k == kind:
            loc: Location
            loc, _ = Location.objects.get_or_create(
                branch=branch,
                code=code,
                defaults={"kind": k, "name_ar": name_ar, "name_en": name_en},
            )
            return loc
    raise ValueError(kind)


@dataclass(frozen=True)
class Move:
    location: Location
    batch: Batch
    quantity_base: int
    unit_cost: Decimal


def lock_balances(
    branch: Branch, keys: Iterable[tuple[Location, Batch]]
) -> dict[tuple[uuid.UUID, uuid.UUID], StockBalance]:
    """Create missing balance rows, then lock all of them in one ordered statement."""
    pairs = {(loc.pk, b.pk): (loc, b) for loc, b in keys}
    if not pairs:
        return {}
    org_id = get_current_org_id()
    with connection.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO inventory_stockbalance (id, organization_id, branch_id, "
            "location_id, item_id, batch_id, quantity_base, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, 0, now()) "
            "ON CONFLICT (organization_id, location_id, batch_id) DO NOTHING",
            [
                (uuid.uuid4(), org_id, branch.pk, loc.pk, b.item_id, b.pk)
                for loc, b in pairs.values()
            ],
        )
    q = StockBalance.objects.none()
    for loc_id, batch_id in pairs:
        q = q | StockBalance.objects.filter(location_id=loc_id, batch_id=batch_id)
    rows = list(q.select_for_update().order_by("branch_id", "item_id", "batch_id", "location_id"))
    return {(r.location_id, r.batch_id): r for r in rows}


def apply_movements(
    branch: Branch,
    moves: list[Move],
    *,
    kind: str,
    document_type: str,
    document_id: uuid.UUID,
    user: User | None,
) -> list[StockMovement]:
    """Record movements and update balances under lock. Raises InsufficientStock."""
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("apply_movements must run inside transaction.atomic()")
    balances = lock_balances(branch, [(m.location, m.batch) for m in moves])
    changed: dict[uuid.UUID, StockBalance] = {}
    movements = []
    for m in moves:
        if m.quantity_base == 0:
            continue
        balance = balances[(m.location.pk, m.batch.pk)]
        if balance.quantity_base + m.quantity_base < 0:
            raise InsufficientStock(m.batch.item_id, balance.quantity_base, -m.quantity_base)
        balance.quantity_base += m.quantity_base
        balance.updated_at = timezone.now()
        changed[balance.pk] = balance
        movements.append(
            StockMovement(
                branch=branch,
                location=m.location,
                item_id=m.batch.item_id,
                batch=m.batch,
                quantity_base=m.quantity_base,
                unit_cost=m.unit_cost,
                kind=kind,
                document_type=document_type,
                document_id=document_id,
                created_by=user,
                organization_id=branch.organization_id,
            )
        )
    StockBalance.objects.bulk_update(list(changed.values()), ["quantity_base", "updated_at"])
    return StockMovement.objects.bulk_create(movements)
