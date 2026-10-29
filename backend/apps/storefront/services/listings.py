"""Publishing items to the storefront. Only complete listings may be published."""

from __future__ import annotations

from typing import Any

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.catalog.models import Item
from apps.catalog.selectors import current_price
from apps.catalog.services.items import ensure_default_price_lists
from apps.storefront.models import Listing, StorefrontSettings

MAX_IMAGE_BYTES = 2 * 1024 * 1024
IMAGE_SIGNATURES = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"RIFF": "webp",
}


class ListingError(Exception):
    def __init__(self, code: str, **detail: object) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


def storefront_settings() -> StorefrontSettings:
    obj: StorefrontSettings
    obj, _ = StorefrontSettings.objects.get_or_create()
    return obj


def listing_for(item: Item) -> Listing:
    """The item's listing, created on first use. Creation holds the item's row lock, so two
    screens opening the catalog at once never collide on a slug (a 500) or make two listings
    for one item (found by the WO-36 checks, which open the catalog in parallel)."""
    listing: Listing | None = Listing.objects.filter(item=item).first()
    if listing is not None:
        return listing
    with transaction.atomic():
        Item.objects.select_for_update().filter(pk=item.pk).first()
        listing = Listing.objects.filter(item=item).first()
        if listing is None:
            base = slugify(item.code) or str(item.pk)[:8]
            slug = base
            n = 2
            while Listing.objects.filter(slug=slug).exists():
                slug = f"{base}-{n}"
                n += 1
            listing = Listing.objects.create(item=item, slug=slug)
    return listing


def sale_unit(item: Item) -> Any:
    units = list(item.units.all())
    return next((u for u in units if u.is_default_sale), None) or next(
        (u for u in units if u.is_base), None
    )


def missing(listing: Listing) -> list[str]:
    """What still blocks publishing: image, Arabic description, price (non-Rx), category."""
    item = listing.item
    out = []
    if not listing.image:
        out.append("image")
    if not listing.description_ar.strip():
        out.append("description")
    if item.classification != Item.Classification.RX:
        unit = sale_unit(item)
        if unit is None or current_price(unit, ensure_default_price_lists()) is None:
            out.append("price")
    if item.category_id is None:
        out.append("category")
    return out


@transaction.atomic
def update_listing(item: Item, data: dict[str, Any], user: User) -> Listing:
    listing: Listing = Listing.objects.select_for_update().get(pk=listing_for(item).pk)
    for field in ("description_ar", "description_en"):
        if field in data:
            setattr(listing, field, data[field])
    if "slug" in data and data["slug"] != listing.slug:
        slug = slugify(data["slug"])
        if not slug or Listing.objects.filter(slug=slug).exclude(pk=listing.pk).exists():
            raise ListingError("slug_taken")
        listing.slug = slug
    if "published" in data and data["published"] != listing.published:
        if data["published"]:
            gaps = missing(listing)
            if gaps:
                raise ListingError("incomplete", missing=",".join(gaps))
            listing.published_at = timezone.now()
            listing.published_by = user
        listing.published = data["published"]
        record(
            "publish" if listing.published else "unpublish",
            "listing",
            listing.pk,
            actor=user,
            item=item.code,
        )
    listing.save()
    return listing


def save_image(item: Item, upload: UploadedFile[bytes], user: User) -> Listing:
    if upload.size is None or upload.size > MAX_IMAGE_BYTES:
        raise ListingError("image_too_large")
    head = upload.read(12)
    upload.seek(0)
    kind = next((ext for sig, ext in IMAGE_SIGNATURES.items() if head.startswith(sig)), None)
    if kind is None or (kind == "webp" and head[8:12] != b"WEBP"):
        raise ListingError("image_type")
    listing = listing_for(item)
    listing.image.save(f"{listing.slug}.{kind}", upload, save=True)
    record("image", "listing", listing.pk, actor=user, item=item.code)
    return listing
