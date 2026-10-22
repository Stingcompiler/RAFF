"""Helpers for storefront tests: an enabled store and published listings."""

from __future__ import annotations

from django.core.files.base import ContentFile

from apps.catalog.models import Category, Item
from apps.storefront.models import Listing, StorefrontSettings
from apps.storefront.services.listings import listing_for, update_listing
from tests.factories import World
from tests.selling import stocked

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def open_store(world: World) -> StorefrontSettings:
    store: StorefrontSettings
    store, _ = StorefrontSettings.objects.get_or_create()
    store.enabled = True
    store.branch = world.khartoum
    store.whatsapp = "249900000000"
    store.save()
    return store


def publish(world: World, item: Item, *, description: str = "وصف") -> Listing:
    category, _ = Category.objects.get_or_create(
        code="pain", defaults={"name_ar": "مسكنات", "name_en": "Pain relief"}
    )
    Item.objects.filter(pk=item.pk).update(category=category)
    item.refresh_from_db()
    listing = listing_for(item)
    listing.image.save(f"{listing.slug}.png", ContentFile(PNG), save=True)
    update_listing(item, {"description_ar": description, "published": True}, world.owner)
    listing.refresh_from_db()
    return listing


def stocked_listing(world: World, code: str = "AUG", boxes: int = 3) -> Listing:
    return publish(world, stocked(world, code=code, boxes=boxes))
