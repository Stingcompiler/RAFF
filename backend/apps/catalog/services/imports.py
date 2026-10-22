"""CSV item import: preview every row, then apply once.

Columns (UTF-8, header row required):
  code, name_ar, name_en, generic_name, strength, dosage_form, category, classification,
  base_unit_ar, base_unit_en, sale_unit_ar, sale_unit_en, sale_unit_factor,
  barcode, price, reorder_level

Matching: an existing `code` updates that item; a barcode owned by another item,
or the same name + strength + form as an existing item (a likely duplicate), is
reported and skipped; repeated codes/barcodes inside the file are errors.
"""

from __future__ import annotations

import csv
import io
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.catalog.models import Barcode, Category, ImportBatch, Item, ItemPrice, ItemUnit
from apps.catalog.search import normalize, search_document
from apps.catalog.services.items import CatalogError, ensure_default_price_lists
from apps.tenancy import clock

COLUMNS = [
    "code",
    "name_ar",
    "name_en",
    "generic_name",
    "strength",
    "dosage_form",
    "category",
    "classification",
    "base_unit_ar",
    "base_unit_en",
    "sale_unit_ar",
    "sale_unit_en",
    "sale_unit_factor",
    "barcode",
    "price",
    "reorder_level",
]
REQUIRED = ["code", "name_ar", "name_en", "base_unit_ar", "base_unit_en"]
MAX_ROWS = 20_000


def _key(name_en: str, strength: str, form: str) -> str:
    return "|".join(normalize(x) for x in (name_en, strength, form))


def _parse_row(raw: dict[str, str]) -> tuple[dict[str, Any], list[str]]:
    row = {c: (raw.get(c) or "").strip() for c in COLUMNS}
    errors = [f"missing_{c}" for c in REQUIRED if not row[c]]
    factor = 1
    if row["sale_unit_ar"] or row["sale_unit_factor"]:
        try:
            factor = int(row["sale_unit_factor"])
            if factor < 1:
                raise ValueError
        except ValueError:
            errors.append("invalid_sale_unit_factor")
    price: str | None = None
    if row["price"]:
        try:
            value = Decimal(row["price"].replace(",", ""))
            if value < 0:
                raise InvalidOperation
            price = str(value)
        except InvalidOperation:
            errors.append("invalid_price")
    reorder = 0
    if row["reorder_level"]:
        try:
            reorder = int(row["reorder_level"])
        except ValueError:
            errors.append("invalid_reorder_level")
    classification = (row["classification"] or "otc").lower()
    if classification not in ("otc", "rx"):
        errors.append("invalid_classification")
    return (
        {
            **row,
            "sale_unit_factor": factor,
            "price": price,
            "reorder_level": reorder,
            "classification": classification,
        },
        errors,
    )


@transaction.atomic
def preview(file_name: str, content: bytes, user: User) -> ImportBatch:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CatalogError("not_utf8") from None
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or not set(REQUIRED) <= set(reader.fieldnames):
        raise CatalogError("missing_columns", required=REQUIRED)

    existing_codes = dict(Item.objects.values_list("code", "id"))
    existing_barcodes = dict(Barcode.objects.values_list("code", "unit__item__code"))
    existing_keys = {
        _key(n, s, f): c
        for c, n, s, f in Item.objects.values_list("code", "name_en", "strength", "dosage_form")
    }
    seen_codes: set[str] = set()
    seen_barcodes: set[str] = set()
    rows: list[dict[str, Any]] = []
    for number, raw in enumerate(reader, start=2):
        if number - 1 > MAX_ROWS:
            raise CatalogError("too_many_rows", limit=MAX_ROWS)
        data, errors = _parse_row(raw)
        code, barcode = data["code"], data["barcode"]
        if code and code in seen_codes:
            errors.append("duplicate_code_in_file")
        if barcode and barcode in seen_barcodes:
            errors.append("duplicate_barcode_in_file")
        seen_codes.add(code)
        if barcode:
            seen_barcodes.add(barcode)
        action, match = "create", None
        if errors:
            action = "error"
        elif code in existing_codes:
            action = "update"
            if barcode and existing_barcodes.get(barcode, code) != code:
                action, match = "duplicate", existing_barcodes[barcode]
                errors.append("barcode_belongs_to_other_item")
        elif barcode and barcode in existing_barcodes:
            action, match = "duplicate", existing_barcodes[barcode]
            errors.append("barcode_belongs_to_other_item")
        elif _key(data["name_en"], data["strength"], data["dosage_form"]) in existing_keys:
            action = "duplicate"
            match = existing_keys[_key(data["name_en"], data["strength"], data["dosage_form"])]
            errors.append("same_name_strength_form")
        rows.append(
            {"line": number, "action": action, "match": match, "errors": errors, "data": data}
        )

    summary = {
        a: sum(r["action"] == a for r in rows) for a in ("create", "update", "duplicate", "error")
    }
    batch: ImportBatch = ImportBatch.objects.create(
        file_name=file_name[:200], rows=rows, summary=summary, created_by=user
    )
    return batch


def _category(code: str, cache: dict[str, Category]) -> Category | None:
    if not code:
        return None
    if code not in cache:
        cache[code], _ = Category.objects.get_or_create(
            code=normalize(code)[:40] or code[:40], defaults={"name_ar": code, "name_en": code}
        )
    return cache[code]


@transaction.atomic
def apply(batch: ImportBatch, user: User) -> ImportBatch:
    """Create/update the previewed rows. Applying the same batch twice changes nothing."""
    batch = ImportBatch.objects.select_for_update().get(pk=batch.pk)
    if batch.status == ImportBatch.Status.APPLIED:
        return batch
    retail = ensure_default_price_lists()
    today = clock.today()
    categories: dict[str, Category] = {}
    created = updated = 0

    to_create = [r["data"] for r in batch.rows if r["action"] == "create"]
    items = Item.objects.bulk_create(
        [
            Item(
                code=d["code"],
                name_ar=d["name_ar"],
                name_en=d["name_en"],
                generic_name=d["generic_name"],
                strength=d["strength"],
                dosage_form=d["dosage_form"],
                category=_category(d["category"], categories),
                classification=d["classification"],
                reorder_level_base=d["reorder_level"],
                organization_id=batch.organization_id,
                search_normalized=search_document(
                    d["name_ar"],
                    d["name_en"],
                    d["generic_name"],
                    d["strength"],
                    d["code"],
                    d["barcode"],
                ),
            )
            for d in to_create
        ]
    )
    units: list[ItemUnit] = []
    sale_units: list[tuple[ItemUnit, dict[str, Any]]] = []
    for item, d in zip(items, to_create, strict=True):
        base = ItemUnit(
            item=item,
            code="base",
            name_ar=d["base_unit_ar"],
            name_en=d["base_unit_en"],
            factor=1,
            is_base=True,
            is_default_sale=not d["sale_unit_ar"],
            organization_id=batch.organization_id,
        )
        units.append(base)
        sale = base
        if d["sale_unit_ar"]:
            sale = ItemUnit(
                item=item,
                code="sale",
                name_ar=d["sale_unit_ar"],
                name_en=d["sale_unit_en"] or d["sale_unit_ar"],
                factor=d["sale_unit_factor"],
                is_default_sale=True,
                organization_id=batch.organization_id,
            )
            units.append(sale)
        sale_units.append((sale, d))
    ItemUnit.objects.bulk_create(units)
    Barcode.objects.bulk_create(
        [
            Barcode(unit=u, code=d["barcode"], organization_id=batch.organization_id)
            for u, d in sale_units
            if d["barcode"]
        ]
    )
    ItemPrice.objects.bulk_create(
        [
            ItemPrice(
                price_list=retail,
                unit=u,
                price=Decimal(d["price"]),
                effective_from=today,
                created_by=user,
                organization_id=batch.organization_id,
            )
            for u, d in sale_units
            if d["price"] is not None
        ]
    )
    created = len(items)

    for r in batch.rows:
        if r["action"] != "update":
            continue
        d = r["data"]
        item = Item.objects.get(code=d["code"])
        for f in (
            "name_ar",
            "name_en",
            "generic_name",
            "strength",
            "dosage_form",
            "classification",
        ):
            setattr(item, f, d[f] or getattr(item, f))
        item.reorder_level_base = d["reorder_level"]
        item.category = _category(d["category"], categories) or item.category
        item.save()
        sale = item.units.filter(is_default_sale=True).first()
        if sale and d["barcode"] and not Barcode.objects.filter(code=d["barcode"]).exists():
            Barcode.objects.create(unit=sale, code=d["barcode"])
        if sale and d["price"] is not None:
            current = (
                ItemPrice.objects.filter(unit=sale, price_list=retail, effective_from__lte=today)
                .order_by("-effective_from")
                .first()
            )
            if current is None or current.price != Decimal(d["price"]):
                ItemPrice.objects.update_or_create(
                    unit=sale,
                    price_list=retail,
                    effective_from=today,
                    defaults={"price": Decimal(d["price"]), "created_by": user},
                )
        barcodes = Barcode.objects.filter(unit__item=item).values_list("code", flat=True)
        item.search_normalized = search_document(
            item.name_ar, item.name_en, item.generic_name, item.strength, item.code, *barcodes
        )
        Item.objects.filter(pk=item.pk).update(search_normalized=item.search_normalized)
        updated += 1

    batch.status = ImportBatch.Status.APPLIED
    batch.applied_at = timezone.now()
    batch.summary = {**batch.summary, "created": created, "updated": updated}
    batch.save(update_fields=["status", "applied_at", "summary"])
    return batch


def export_rows() -> list[list[str]]:
    """Every item in the import format, so an export can be edited and re-imported."""
    from apps.catalog.selectors import current_price

    retail = ensure_default_price_lists()
    out = [COLUMNS]
    items = (
        Item.objects.select_related("category").prefetch_related("units__barcodes").order_by("code")
    )
    for item in items:
        units = list(item.units.all())
        base = next((u for u in units if u.is_base), None)
        sale = next((u for u in units if u.is_default_sale), base)
        price = current_price(sale, retail) if sale else None
        barcode = next(iter(sale.barcodes.all()), None) if sale else None
        has_pack = sale is not None and base is not None and sale.pk != base.pk
        out.append(
            [
                item.code,
                item.name_ar,
                item.name_en,
                item.generic_name,
                item.strength,
                item.dosage_form,
                item.category.code if item.category else "",
                item.classification,
                base.name_ar if base else "",
                base.name_en if base else "",
                sale.name_ar if has_pack and sale else "",
                sale.name_en if has_pack and sale else "",
                str(sale.factor) if has_pack and sale else "",
                barcode.code if barcode else "",
                str(price.price.normalize()) if price else "",
                str(item.reorder_level_base),
            ]
        )
    return out
