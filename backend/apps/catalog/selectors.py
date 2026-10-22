# Read-side queries for this app. All reads go through OrgScopedQuerySet.
from __future__ import annotations

import datetime as dt

from django.contrib.postgres.search import TrigramWordSimilarity
from django.db.models import OuterRef, Q, QuerySet, Subquery

from apps.catalog.models import Barcode, Item, ItemPrice, ItemUnit, PriceList
from apps.catalog.search import normalize
from apps.tenancy import clock


def current_price_subquery(unit_ref: str, price_list: PriceList, on: dt.date) -> Subquery:
    return Subquery(
        ItemPrice.objects.filter(
            unit=OuterRef(unit_ref), price_list=price_list, effective_from__lte=on
        )
        .order_by("-effective_from")
        .values("price")[:1]
    )


def current_price(
    unit: ItemUnit, price_list: PriceList, on: dt.date | None = None
) -> ItemPrice | None:
    return (
        ItemPrice.objects.filter(
            unit=unit, price_list=price_list, effective_from__lte=on or clock.today()
        )
        .order_by("-effective_from")
        .first()
    )


def find_by_barcode(code: str) -> Barcode | None:
    return Barcode.objects.select_related("unit__item").filter(code=code.strip()).first()


def search_items(
    query: str = "",
    *,
    category: str | None = None,
    active: bool | None = True,
) -> QuerySet[Item]:
    """Items matching a loose query. Exact barcode/code first, then trigram similarity."""
    qs = Item.objects.select_related("category").prefetch_related("units")
    if active is not None:
        qs = qs.filter(is_active=active)
    if category:
        qs = qs.filter(category__code=category)
    q = normalize(query)
    if not q:
        return qs.order_by("name_en")
    exact = Item.objects.filter(
        Q(code__iexact=query.strip()) | Q(units__barcodes__code=query.strip())
    )
    if exact.exists():
        return qs.filter(pk__in=exact.values("pk"))
    terms = q.split()
    matched = qs.annotate(similarity=TrigramWordSimilarity(q, "search_normalized"))
    containment = Q()
    for term in terms:
        containment &= Q(search_normalized__contains=term)
    result: QuerySet[Item] = matched.filter(containment | Q(similarity__gte=0.45)).order_by(
        "-similarity", "name_en"
    )
    return result
