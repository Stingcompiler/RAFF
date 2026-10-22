"""Helpers for stock tests: an item with a base unit and a pack unit, a supplier, receipts."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from apps.accounts.models import User
from apps.catalog.models import Item
from apps.catalog.services.items import UnitSpec, create_item
from apps.purchasing.models import GoodsReceipt, Supplier
from apps.purchasing.services.receiving import LineInput, save_draft
from apps.tenancy.models import Branch


def boxed_item(code: str = "AUG", factor: int = 14) -> Item:
    return create_item(
        code=code,
        name_ar=f"صنف {code}",
        name_en=f"Item {code}",
        units=[
            UnitSpec("tab", "قرص", "Tablet", 1, is_base=True),
            UnitSpec("box", "علبة", "Box", factor, is_default_sale=True),
        ],
        reorder_level_base=20,
    )


def supplier(code: str = "NADA") -> Supplier:
    s: Supplier = Supplier.objects.get_or_create(
        code=code, defaults={"name_ar": "الندى", "name_en": "Al-Nada"}
    )[0]
    return s


def draft(
    branch: Branch,
    user: User,
    item: Item,
    *,
    invoice: str = "INV-1",
    quantity: int = 10,
    bonus: int = 0,
    unit_cost: str = "14.4",
    batch: str = "B-1",
    expiry: dt.date | None = dt.date(2030, 1, 31),
    unit: str = "box",
) -> GoodsReceipt:
    return save_draft(
        receipt=None,
        branch=branch,
        supplier=supplier(),
        supplier_invoice_no=invoice,
        invoice_date=dt.date(2026, 10, 21),
        payment_terms_days=30,
        notes="",
        lines=[
            LineInput(
                item_id=item.pk,
                unit_id=item.units.get(code=unit).pk,
                quantity=quantity,
                bonus_quantity=bonus,
                unit_cost=Decimal(unit_cost),
                discount=Decimal(0),
                batch_no=batch,
                expiry_date=expiry,
            )
        ],
        user=user,
    )
