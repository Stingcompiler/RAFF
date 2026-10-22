"""Items, units, barcodes and price versions."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.catalog.models import Barcode, Category, Item, ItemPrice, ItemUnit, PriceList
from apps.catalog.search import search_document
from apps.finance.money import money


class CatalogError(Exception):
    def __init__(self, code: str, **detail: object) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


@dataclass
class UnitSpec:
    code: str
    name_ar: str
    name_en: str
    factor: int
    is_base: bool = False
    is_default_sale: bool = False
    barcodes: list[str] = field(default_factory=list)


def ensure_default_price_lists() -> PriceList:
    retail: PriceList
    retail, _ = PriceList.objects.get_or_create(
        code="retail", defaults={"name_ar": "سعر البيع", "name_en": "Retail", "is_default": True}
    )
    PriceList.objects.get_or_create(
        code="wholesale", defaults={"name_ar": "قائمة الجملة", "name_en": "Wholesale"}
    )
    return retail


def refresh_search(item: Item) -> None:
    barcodes = Barcode.objects.filter(unit__item=item).values_list("code", flat=True)
    item.search_normalized = search_document(
        item.name_ar, item.name_en, item.generic_name, item.strength, item.code, *barcodes
    )
    Item.objects.filter(pk=item.pk).update(search_normalized=item.search_normalized)


def _validate_units(units: list[UnitSpec]) -> None:
    bases = [u for u in units if u.is_base]
    if len(bases) != 1 or bases[0].factor != 1:
        raise CatalogError("base_unit_required")
    if len({u.code for u in units}) != len(units):
        raise CatalogError("duplicate_unit")
    if any(u.factor < 1 for u in units):
        raise CatalogError("unit_factor_invalid")
    if sum(u.is_default_sale for u in units) > 1:
        raise CatalogError("one_default_sale_unit")


def _check_barcodes_free(codes: list[str], item: Item | None = None) -> None:
    if len(set(codes)) != len(codes):
        raise CatalogError("duplicate_barcode")
    taken = Barcode.objects.filter(code__in=codes).select_related("unit__item")
    for b in taken:
        if item is None or b.unit.item_id != item.pk:
            raise CatalogError("barcode_taken", barcode=b.code, item=str(b.unit.item_id))


@transaction.atomic
def create_item(
    *,
    code: str,
    name_ar: str,
    name_en: str,
    units: list[UnitSpec],
    generic_name: str = "",
    strength: str = "",
    dosage_form: str = "",
    category: Category | None = None,
    classification: str = Item.Classification.OTC,
    reorder_level_base: int = 0,
) -> Item:
    if Item.objects.filter(code=code).exists():
        raise CatalogError("code_taken")
    _validate_units(units)
    _check_barcodes_free([b for u in units for b in u.barcodes])
    item: Item = Item.objects.create(
        code=code,
        name_ar=name_ar,
        name_en=name_en,
        generic_name=generic_name,
        strength=strength,
        dosage_form=dosage_form,
        category=category,
        classification=classification,
        reorder_level_base=reorder_level_base,
    )
    if not any(u.is_default_sale for u in units):
        max(units, key=lambda u: u.factor).is_default_sale = True
    for spec in units:
        unit = ItemUnit.objects.create(
            item=item,
            code=spec.code,
            name_ar=spec.name_ar,
            name_en=spec.name_en,
            factor=spec.factor,
            is_base=spec.is_base,
            is_default_sale=spec.is_default_sale,
        )
        for code_ in spec.barcodes:
            Barcode.objects.create(unit=unit, code=code_)
    refresh_search(item)
    return item


EDITABLE = (
    "name_ar",
    "name_en",
    "generic_name",
    "strength",
    "dosage_form",
    "category",
    "classification",
    "reorder_level_base",
    "is_active",
)


@transaction.atomic
def update_item(item: Item, **changes: object) -> Item:
    unknown = set(changes) - set(EDITABLE)
    if unknown:
        raise CatalogError("not_editable", fields=sorted(unknown))
    for key, value in changes.items():
        setattr(item, key, value)
    item.save()
    refresh_search(item)
    return item


@transaction.atomic
def add_barcode(unit: ItemUnit, code: str) -> Barcode:
    _check_barcodes_free([code], unit.item)
    barcode: Barcode = Barcode.objects.create(unit=unit, code=code)
    refresh_search(unit.item)
    return barcode


@transaction.atomic
def set_price(
    unit: ItemUnit,
    price: Decimal,
    *,
    price_list: PriceList | None = None,
    effective_from: dt.date | None = None,
    user: User | None = None,
) -> ItemPrice:
    """Record a new price version; the same day replaces nothing, it is refused."""
    if price < 0:
        raise CatalogError("price_negative")
    price_list = price_list or ensure_default_price_lists()
    effective_from = effective_from or timezone.localdate()
    if ItemPrice.objects.filter(
        price_list=price_list, unit=unit, effective_from=effective_from
    ).exists():
        raise CatalogError("price_exists_for_date")
    version: ItemPrice = ItemPrice.objects.create(
        price_list=price_list,
        unit=unit,
        price=money(price),
        effective_from=effective_from,
        created_by=user,
    )
    return version
