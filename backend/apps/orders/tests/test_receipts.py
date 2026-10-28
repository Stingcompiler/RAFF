"""WO-30b acceptance: the photo of a bank transfer is private, clean and short-lived."""

from __future__ import annotations

import datetime as dt
import struct
from pathlib import Path
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.orders.models import Order
from apps.orders.services import receipts
from apps.orders.services.workflow import transition
from apps.returns.tests.test_api import owner_at
from apps.storefront.models import Listing
from apps.tenancy.context import org_context
from tests.factories import World
from tests.storefront import stocked_listing

from .test_inquiries import guest
from .test_payments import bank, place, prepay_open

pytestmark = pytest.mark.django_db

SECRET = b"GPS-15.5006N-32.5599E"


def jpeg(extra: bytes = b"") -> bytes:
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    exif = b"Exif\x00\x00" + SECRET
    app1 = b"\xff\xe1" + struct.pack(">H", len(exif) + 2) + exif
    com = b"\xff\xfe" + struct.pack(">H", len(SECRET) + 2) + SECRET
    return (
        b"\xff\xd8"
        + app0
        + app1
        + com
        + b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00"
        + b"PIXELS"
        + extra
        + b"\xff\xd9"
    )


def chunk(kind: bytes, body: bytes) -> bytes:
    return struct.pack(">I", len(body)) + kind + body + b"\x00\x00\x00\x00"


def png() -> bytes:
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"tEXt", b"Comment\x00" + SECRET)
        + chunk(b"eXIf", SECRET)
        + chunk(b"IDAT", b"PIXELS")
        + chunk(b"IEND", b"")
    )


def upload(client: Any, csrf: dict[str, Any], token: str, data: bytes, name: str = "r.jpg") -> Any:
    return client.post(
        f"/api/v1/public/orders/{token}/receipt/",
        {"image": SimpleUploadedFile(name, data)},
        format="multipart",
        **csrf,
    )


def prepaid_order(world: World, tmp_path: Path, settings: Any) -> tuple[Any, dict[str, Any], Order]:
    settings.PRIVATE_ROOT = tmp_path
    with org_context(world.org.id):
        prepay_open(world)
        slug = stocked_listing(world).slug
    client, csrf = guest()
    assert place(client, csrf, slug, **bank()).status_code == 201
    with org_context(world.org.id):
        return client, csrf, Order.objects.get()


def test_the_photo_is_stored_privately_without_its_metadata(
    world: World, tmp_path: Path, settings: Any
) -> None:
    client, csrf, order = prepaid_order(world, tmp_path, settings)
    done = upload(client, csrf, order.token, jpeg())
    assert done.status_code == 200 and done.json()["has_receipt"] is True
    assert "receipt" not in {k for k in done.json() if k != "has_receipt"}
    with org_context(world.org.id):
        order.refresh_from_db()
        stored = Path(order.payment_receipt.path)
        assert stored.is_relative_to(tmp_path) and not stored.is_relative_to(settings.MEDIA_ROOT)
        data = stored.read_bytes()
        assert b"PIXELS" in data and data.startswith(b"\xff\xd8") and data.endswith(b"\xff\xd9")
        assert SECRET not in data and b"Exif" not in data and b"JFIF" in data
        assert order.payment_events.filter(kind="receipt").count() == 1

    with org_context(world.org.id):
        slug = Listing.objects.get().slug
    other, ocsrf = guest()
    place(other, ocsrf, slug, phone="0933333333", **bank(ref="PNG-12345"))
    with org_context(world.org.id):
        second = Order.objects.exclude(pk=order.pk).get()
    assert upload(other, ocsrf, second.token, png(), "r.png").status_code == 200
    with org_context(world.org.id):
        second.refresh_from_db()
        data = Path(second.payment_receipt.path).read_bytes()
        assert data.startswith(b"\x89PNG") and SECRET not in data and b"IDAT" in data
        assert b"tEXt" not in data and b"eXIf" not in data


def test_only_small_jpeg_and_png_for_an_open_prepaid_order(
    world: World, tmp_path: Path, settings: Any
) -> None:
    client, csrf, order = prepaid_order(world, tmp_path, settings)
    for name, data in (("a.gif", b"GIF89a" + b"0" * 40), ("a.pdf", b"%PDF-1.4" + b"0" * 40)):
        bad = upload(client, csrf, order.token, data, name)
        assert bad.status_code == 400 and bad.json()["detail"] == "image_type"
    broken = upload(client, csrf, order.token, b"\xff\xd8\xff\xe1\x00\xff short")
    assert broken.json()["detail"] == "image_type"
    huge = upload(client, csrf, order.token, jpeg(b"0" * receipts.MAX_BYTES))
    assert huge.status_code == 413 and huge.json()["detail"] == "image_too_large"
    nothing = client.post(
        f"/api/v1/public/orders/{order.token}/receipt/", {}, format="multipart", **csrf
    )
    assert nothing.json()["detail"] == "image_required"
    assert upload(client, csrf, "x" * 40, jpeg()).status_code == 404

    staff, scsrf = owner_at(world, world.khartoum.pk)
    staff.post(f"/api/v1/orders/{order.pk}/payment/", {"action": "verify"}, format="json", **scsrf)
    late = upload(client, csrf, order.token, jpeg())
    assert late.json()["detail"] == "payment_not_open"  # verified: the photo can no longer change


def test_a_cash_order_takes_no_receipt(world: World, tmp_path: Path, settings: Any) -> None:
    settings.PRIVATE_ROOT = tmp_path
    with org_context(world.org.id):
        prepay_open(world)
        slug = stocked_listing(world).slug
    client, csrf = guest()
    place(client, csrf, slug)
    with org_context(world.org.id):
        order = Order.objects.get()
    assert upload(client, csrf, order.token, jpeg()).json()["detail"] == "not_prepaid"


def test_a_new_photo_replaces_the_old_file(world: World, tmp_path: Path, settings: Any) -> None:
    client, csrf, order = prepaid_order(world, tmp_path, settings)
    upload(client, csrf, order.token, jpeg())
    with org_context(world.org.id):
        order.refresh_from_db()
        first = Path(order.payment_receipt.path)
    upload(client, csrf, order.token, png(), "b.png")
    with org_context(world.org.id):
        order.refresh_from_db()
        assert not first.exists() and Path(order.payment_receipt.path).exists()
    assert len(list(tmp_path.rglob("*.*"))) == 1


def test_only_staff_of_the_branch_open_the_photo(
    world: World, tmp_path: Path, settings: Any
) -> None:
    client, csrf, order = prepaid_order(world, tmp_path, settings)
    url = f"/api/v1/orders/{order.pk}/receipt/"
    staff, _ = owner_at(world, world.khartoum.pk)
    assert staff.get(url).status_code == 404  # no photo yet
    upload(client, csrf, order.token, jpeg())
    assert client.get(url).status_code in (401, 403)  # a guest, even with the token
    opened = staff.get(url)
    assert opened.status_code == 200 and opened["Content-Type"] == "image/jpeg"
    assert opened["Cache-Control"] == "private, no-store"
    assert opened["X-Content-Type-Options"] == "nosniff"
    assert "sandbox" in opened["Content-Security-Policy"]
    assert SECRET not in b"".join(opened.streaming_content)  # type: ignore[attr-defined]
    other, _ = owner_at(world, world.omdurman.pk)
    assert other.get(url).status_code == 404
    shown = client.get(f"/api/v1/public/orders/{order.token}/").json()
    assert shown["has_receipt"] is True and "payment_receipt" not in shown
    detail = staff.get(f"/api/v1/orders/{order.pk}/").json()
    assert detail["has_receipt"] is True and "payment_receipt" not in detail


def test_old_photos_of_closed_orders_are_deleted(
    world: World, tmp_path: Path, settings: Any
) -> None:
    client, csrf, order = prepaid_order(world, tmp_path, settings)
    upload(client, csrf, order.token, jpeg())
    with org_context(world.org.id):
        order.refresh_from_db()
        path = Path(order.payment_receipt.path)
        assert receipts.purge_old() == 0  # still open
        transition(order.pk, "cancelled", "test", world.owner)
        assert receipts.purge_old() == 0  # closed today
        Order.objects.filter(pk=order.pk).update(updated_at=timezone.now() - dt.timedelta(days=91))
        assert receipts.purge_old() == 1
        order.refresh_from_db()
        assert not order.payment_receipt and not path.exists()
        assert order.payment_reference  # the order keeps its transfer details
