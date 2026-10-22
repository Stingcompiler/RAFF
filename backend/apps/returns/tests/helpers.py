"""A posted sale to return against."""

from __future__ import annotations

import uuid
from decimal import Decimal

from apps.catalog.models import Item
from apps.returns.services.posting import ReturnLineRequest, post_return
from apps.sales.models import Sale
from apps.sales.services.posting import PaymentRequest, post_sale
from tests.factories import World
from tests.selling import line


def sell(world: World, item: Item, boxes: int = 2, **kw: object) -> Sale:
    total = Decimal("12500") * boxes
    result = post_sale(
        device=world.counter,
        user=world.cashier,
        lines=[line(item, boxes)],
        payments=kw.pop("payments", None) or [PaymentRequest("cash", total)],  # type: ignore[arg-type]
        customer_id=kw.pop("customer_id", None),  # type: ignore[arg-type]
        can_discount=False,
        idempotency_key=str(uuid.uuid4()),
    )
    sale: Sale = Sale.objects.get(pk=result["id"])
    return sale


def give_back(
    world: World, sale: Sale, quantity: int = 1, refund: str = "cash", key: str | None = None
) -> dict[str, object]:
    return post_return(
        sale_id=sale.pk,
        device=world.counter,
        refund=refund,
        lines=[ReturnLineRequest(sale.lines.get().pk, quantity, "damaged", "sealed")],
        idempotency_key=key or str(uuid.uuid4()),
        user=world.cashier,
    )
