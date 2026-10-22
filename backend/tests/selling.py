"""Helpers for sales tests: stocked items, an open shift, request builders."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal

from apps.catalog.models import Item
from apps.catalog.services.items import set_price
from apps.purchasing.services.receiving import post_receipt
from apps.sales.services.pricing import LineRequest
from apps.sales.services.shifts import open_shift
from tests.factories import World
from tests.stock import boxed_item, draft


def stocked(
    world: World,
    *,
    code: str = "AUG",
    boxes: int = 2,
    price: str = "12500",
    batch: str = "B-1",
    expiry: dt.date = dt.date(2030, 1, 31),
    invoice: str | None = None,
) -> Item:
    item = boxed_item(code=code, factor=14)
    set_price(item.units.get(code="box"), Decimal(price))
    receipt = draft(
        world.khartoum,
        world.owner,
        item,
        invoice=invoice or f"INV-{code}-{batch}",
        quantity=boxes,
        unit_cost="9800",
        batch=batch,
        expiry=expiry,
    )
    post_receipt(receipt.pk, idempotency_key=str(uuid.uuid4()), user=world.owner)
    return item


def add_batch(world: World, item: Item, *, boxes: int, batch: str, expiry: dt.date) -> None:
    receipt = draft(
        world.khartoum,
        world.owner,
        item,
        invoice=f"INV-{item.code}-{batch}",
        quantity=boxes,
        unit_cost="9800",
        batch=batch,
        expiry=expiry,
    )
    post_receipt(receipt.pk, idempotency_key=str(uuid.uuid4()), user=world.owner)


def line(item: Item, qty: int = 1, unit: str = "box", **kw: object) -> LineRequest:
    return LineRequest(item_id=item.pk, unit_id=item.units.get(code=unit).pk, quantity=qty, **kw)  # type: ignore[arg-type]


def with_shift(world: World) -> None:
    open_shift(world.counter, world.cashier, Decimal("50000"))
