"""Server-side pricing: the only place sale amounts are computed and rounded."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal

from django.conf import settings

from apps.catalog.models import Item, ItemUnit, PriceList
from apps.catalog.selectors import current_price
from apps.catalog.services.items import ensure_default_price_lists
from apps.finance.money import money


class PricingError(Exception):
    def __init__(self, code: str, line: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.line = line


@dataclass(frozen=True)
class LineRequest:
    item_id: uuid.UUID
    unit_id: uuid.UUID
    quantity: int
    discount_pct: Decimal = Decimal(0)
    batch_id: uuid.UUID | None = None


@dataclass(frozen=True)
class PricedLine:
    line_no: int
    item: Item
    unit: ItemUnit
    quantity: int
    base_quantity: int
    unit_price: Decimal
    discount_pct: Decimal
    line_subtotal: Decimal
    discount: Decimal
    line_total: Decimal
    batch_id: uuid.UUID | None


@dataclass(frozen=True)
class Quote:
    lines: list[PricedLine]
    subtotal: Decimal
    discount_total: Decimal
    total: Decimal


def unit_price(unit: ItemUnit, price_list: PriceList) -> Decimal | None:
    """The unit's own price, else derived from the default sale unit's price."""
    own = current_price(unit, price_list)
    if own is not None:
        price: Decimal = own.price
        return price
    sale = unit.item.units.filter(is_default_sale=True).first()
    base = current_price(sale, price_list) if sale else None
    if base is None or sale is None:
        return None
    return money(base.price / sale.factor * unit.factor)


def quote(lines: list[LineRequest], *, can_discount: bool) -> Quote:
    if not lines:
        raise PricingError("empty_cart")
    retail = ensure_default_price_lists()
    items = {i.pk: i for i in Item.objects.filter(pk__in={li.item_id for li in lines})}
    units = {
        u.pk: u
        for u in ItemUnit.objects.select_related("item").filter(pk__in={li.unit_id for li in lines})
    }
    priced = []
    for no, req in enumerate(lines, start=1):
        item, unit = items.get(req.item_id), units.get(req.unit_id)
        if item is None or unit is None or unit.item_id != item.pk:
            raise PricingError("unknown_item", no)
        if not item.is_active:
            raise PricingError("item_inactive", no)
        if req.quantity < 1:
            raise PricingError("invalid_quantity", no)
        pct = Decimal(req.discount_pct)
        if pct < 0 or pct > 100:
            raise PricingError("invalid_discount", no)
        if pct and not can_discount:
            raise PricingError("discount_not_allowed", no)
        if pct > settings.RAFF_MAX_LINE_DISCOUNT_PCT:
            raise PricingError("discount_too_high", no)
        price = unit_price(unit, retail)
        if price is None:
            raise PricingError("no_price", no)
        subtotal = money(price * req.quantity)
        discount = money(subtotal * pct / 100)
        priced.append(
            PricedLine(
                line_no=no,
                item=item,
                unit=unit,
                quantity=req.quantity,
                base_quantity=req.quantity * unit.factor,
                unit_price=price,
                discount_pct=pct,
                line_subtotal=subtotal,
                discount=discount,
                line_total=subtotal - discount,
                batch_id=req.batch_id,
            )
        )
    subtotal = sum((p.line_subtotal for p in priced), Decimal(0))
    discount_total = sum((p.discount for p in priced), Decimal(0))
    return Quote(priced, subtotal, discount_total, subtotal - discount_total)
