# Read-side queries for this app. All reads go through OrgScopedQuerySet.
"""What the public may see. Never stock numbers, costs or internal notes (CLAUDE.md rule 18)."""

from __future__ import annotations

import uuid
from typing import Any

from django.db.models import Count, Sum

from apps.catalog.models import Category, Item, ItemPrice
from apps.catalog.selectors import search_items
from apps.catalog.services.items import ensure_default_price_lists
from apps.inventory.models import Location, StockBalance
from apps.storefront.models import Listing, StorefrontSettings
from apps.storefront.services.listings import sale_unit
from apps.tenancy import clock

AVAILABLE, CONFIRM, UNAVAILABLE = "available", "confirm", "unavailable"


def reserved(branch_id: uuid.UUID | None, item_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """Base units held by confirmed storefront orders (filled in by WO-09)."""
    try:
        from apps.orders.selectors import reserved_base
    except ImportError:  # pragma: no cover
        return {}
    return reserved_base(branch_id, item_ids)


def availability(settings: StorefrontSettings, items: list[Item]) -> dict[uuid.UUID, str]:
    """Three words, never a number: available, needs confirmation, unavailable."""
    if settings.branch_id is None:
        return dict.fromkeys((i.pk for i in items), CONFIRM)
    ids = [i.pk for i in items]
    on_shelf = {
        r["item_id"]: r["q"] or 0
        for r in StockBalance.objects.filter(
            branch_id=settings.branch_id,
            item_id__in=ids,
            location__kind=Location.Kind.SELLABLE,
            batch__expiry_date__gte=clock.today(),
        )
        .values("item_id")
        .annotate(q=Sum("quantity_base"))
    }
    held = reserved(settings.branch_id, ids)
    out = {}
    for item in items:
        free = on_shelf.get(item.pk, 0) - held.get(item.pk, 0)
        unit = sale_unit(item)
        one = unit.factor if unit else 1
        if free < one:
            out[item.pk] = UNAVAILABLE
        elif free < max(item.reorder_level_base, one):
            out[item.pk] = CONFIRM
        else:
            out[item.pk] = AVAILABLE
    return out


def current_prices(items: list[Item]) -> dict[uuid.UUID, ItemPrice]:
    """Today's retail price of each item's sale unit, in one query however many items
    (DISTINCT ON the unit, newest effective date first; review B-08)."""
    retail = ensure_default_price_lists()
    units = {item.pk: unit for item in items if (unit := sale_unit(item)) is not None}
    latest = {
        p.unit_id: p
        for p in ItemPrice.objects.filter(
            unit__in=list(units.values()), price_list=retail, effective_from__lte=clock.today()
        )
        .order_by("unit_id", "-effective_from")
        .distinct("unit_id")
    }
    return {item_id: latest[u.pk] for item_id, u in units.items() if u.pk in latest}


def product_rows(
    settings: StorefrontSettings, listings: list[Listing], *, detail: bool = False
) -> list[dict[str, Any]]:
    items = [li.item for li in listings]
    avail = availability(settings, items)
    prices = current_prices(items)
    rows = []
    for li in listings:
        item = li.item
        unit = sale_unit(item)
        rx = item.classification == Item.Classification.RX
        price = None if rx else prices.get(item.pk)
        row = {
            "slug": li.slug,
            "name_ar": item.name_ar,
            "name_en": item.name_en,
            "strength": item.strength,
            "unit_ar": unit.name_ar if unit else "",
            "unit_en": unit.name_en if unit else "",
            "category": item.category.code if item.category else None,
            "rx": rx,
            "price": price.price if price else None,
            "price_date": price.effective_from if price else None,
            "availability": None if rx else avail[item.pk],
            "image": li.image.url if li.image else None,
        }
        if detail:
            row["description_ar"] = li.description_ar
            row["description_en"] = li.description_en
        rows.append(row)
    return rows


def published(query: str = "", category: str = "", slugs: list[str] | None = None) -> list[Listing]:
    qs = (
        Listing.objects.filter(published=True, item__is_active=True)
        .select_related("item__category")
        .prefetch_related("item__units")
    )
    if slugs is not None:
        qs = qs.filter(slug__in=slugs)
    if category:
        qs = qs.filter(item__category__code=category)
    if query.strip():
        # Same matching as the staff search (hamza, ta marbuta, Western digits, trigrams).
        qs = qs.filter(item__in=search_items(query, active=True).values("pk"))
    return list(qs.order_by("item__name_ar"))


def categories() -> list[dict[str, Any]]:
    counts = {
        r["item__category__code"]: r["n"]
        for r in Listing.objects.filter(published=True, item__is_active=True)
        .values("item__category__code")
        .annotate(n=Count("id"))
    }
    return [
        {"code": c.code, "name_ar": c.name_ar, "name_en": c.name_en, "count": counts[c.code]}
        for c in Category.objects.filter(code__in=[k for k in counts if k]).order_by("name_ar")
    ]
