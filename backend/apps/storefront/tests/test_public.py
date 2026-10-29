from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.catalog.models import Item
from apps.storefront.services.listings import ListingError, listing_for, update_listing
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import stocked
from tests.storefront import open_store, publish, stocked_listing

pytestmark = pytest.mark.django_db

FORBIDDEN = {
    "quantity",
    "quantity_base",
    "sellable",
    "sellable_base",
    "stock",
    "available_base",
    "available_units",
    "unit_cost",
    "cost",
    "cost_total",
    "balance",
    "internal_note",
    "actor_ar",
    "actor_en",
    "assigned_ar",
    "assigned_en",
}


def keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in keys(v)}
    return set()


def test_no_public_response_carries_stock_numbers(world: World) -> None:
    """Contract (WO-08): the public API shows availability as words, never numbers."""
    with org_context(world.org.id):
        open_store(world)
        listing = stocked_listing(world)
    client = APIClient()
    responses = [
        client.get("/api/v1/public/store/"),
        client.get("/api/v1/public/categories/"),
        client.get("/api/v1/public/products/"),
        client.get("/api/v1/public/products/", {"q": "Item"}),
        client.get(f"/api/v1/public/products/{listing.slug}/"),
    ]
    for res in responses:
        assert res.status_code == 200, res.content
        assert not keys(res.json()) & FORBIDDEN, keys(res.json()) & FORBIDDEN
    product = responses[-1].json()
    assert product["availability"] == "available"
    assert product["price"] == "12500.0000" and product["price_date"]


def test_unpublished_and_incomplete_items_stay_private(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        hidden = stocked(world, code="HID")
        listing = listing_for(hidden)
        with pytest.raises(ListingError) as exc:
            update_listing(hidden, {"published": True}, world.owner)
        assert exc.value.code == "incomplete"
        assert set(str(exc.value.detail["missing"]).split(",")) == {
            "image",
            "description",
            "category",
        }
    client = APIClient()
    assert client.get(f"/api/v1/public/products/{listing.slug}/").status_code == 404
    assert client.get("/api/v1/public/products/").json() == []


def test_rx_items_have_no_price_and_availability_words(world: World) -> None:
    with org_context(world.org.id):
        open_store(world)
        item = stocked(world, code="RX1", boxes=1)
        Item.objects.filter(pk=item.pk).update(classification=Item.Classification.RX)
        item.refresh_from_db()
        listing = publish(world, item)
        low = stocked_listing(world, code="LOW", boxes=1)  # 14 tablets < reorder level 20
    client = APIClient()
    rx = client.get(f"/api/v1/public/products/{listing.slug}/").json()
    assert rx["rx"] is True and rx["price"] is None and rx["availability"] is None
    assert client.get(f"/api/v1/public/products/{low.slug}/").json()["availability"] == "confirm"


def test_c03_the_cart_reads_exactly_its_own_items(world: World) -> None:
    from rest_framework.test import APIClient

    with org_context(world.org.id):
        open_store(world)
        listing = stocked_listing(world)
    client = APIClient()
    rows = client.get(f"/api/v1/public/products/?slugs={listing.slug},missing-item").json()
    assert [r["slug"] for r in rows] == [listing.slug]
    assert client.get("/api/v1/public/products/?slugs=missing-item").json() == []
