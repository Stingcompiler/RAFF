"""The photo of a bank transfer's confirmation (D-R0021, WO-30b).

Receipts show account numbers and names, so they are kept in a private directory, read only by
staff through an authenticated endpoint, stripped of metadata (phone photos carry GPS), limited
to JPEG and PNG, and deleted a while after the order is closed.
"""

from __future__ import annotations

import datetime as dt
import struct
import uuid
import zlib
from typing import Any

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from apps.audit.services.log import record
from apps.orders.models import Order, OrderPaymentEvent
from apps.orders.services import payments

MAX_BYTES = 3 * 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# PNG chunks that draw the picture; everything else (text, time, EXIF) is dropped.
PNG_KEEP = {
    b"IHDR",
    b"PLTE",
    b"IDAT",
    b"IEND",
    b"tRNS",
    b"gAMA",
    b"cHRM",
    b"sRGB",
    b"iCCP",
    b"sBIT",
}
# JPEG segments kept: JFIF (APP0), ICC colour (APP2), Adobe colour transform (APP14).
JPEG_KEEP_APP = {0xE0, 0xE2, 0xEE}
OPEN_STATUSES = {
    Order.PaymentStatus.AWAITING_PROOF,
    Order.PaymentStatus.SUBMITTED,
    Order.PaymentStatus.REJECTED,
}


class ReceiptError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
MAX_SIDE = 20000


def _jpeg_scan_end(data: bytes, start: int) -> int:
    """End of entropy-coded data: the next marker that is not a stuffed 0xFF00 or a restart."""
    j = start
    while j + 1 < len(data):
        if data[j] == 0xFF and data[j + 1] != 0 and not 0xD0 <= data[j + 1] <= 0xD7:
            return j
        j += 1
    raise ReceiptError("image_type")


def _strip_jpeg(data: bytes) -> bytes:
    """Rebuild the JPEG from its picture segments only. Every scan of a progressive JPEG is
    walked, so metadata between scans is dropped too; the file must have a frame header, at
    least one scan and its end marker."""
    out = bytearray(b"\xff\xd8")
    pos = 2
    frame = scanned = False
    while True:
        if pos >= len(data) or data[pos] != 0xFF:
            raise ReceiptError("image_type")
        while pos < len(data) and data[pos] == 0xFF:  # fill bytes
            pos += 1
        if pos >= len(data):
            raise ReceiptError("image_type")
        marker = data[pos]
        pos += 1
        if marker == 0xD9:  # EOI
            if not (frame and scanned):
                raise ReceiptError("image_type")
            out += b"\xff\xd9"
            return bytes(out)
        if 0xD0 <= marker <= 0xD7 or marker in (0x01, 0x00):
            out += bytes([0xFF, marker])
            continue
        if pos + 2 > len(data):
            raise ReceiptError("image_type")
        (length,) = struct.unpack(">H", data[pos : pos + 2])
        end = pos + length
        if length < 2 or end > len(data):
            raise ReceiptError("image_type")
        if marker in SOF_MARKERS:
            if length < 8:
                raise ReceiptError("image_type")
            height, width = struct.unpack(">HH", data[pos + 3 : pos + 7])
            if not (0 < width <= MAX_SIDE and 0 < height <= MAX_SIDE):
                raise ReceiptError("image_type")
            frame = True
        is_app = 0xE0 <= marker <= 0xEF
        if not ((is_app and marker not in JPEG_KEEP_APP) or marker == 0xFE):
            out += bytes([0xFF, marker]) + data[pos:end]  # EXIF, XMP, Photoshop, comments go
        pos = end
        if marker == 0xDA:  # start of scan: copy its picture data up to the next marker
            if not frame:
                raise ReceiptError("image_type")
            scan_end = _jpeg_scan_end(data, pos)
            out += data[pos:scan_end]
            pos = scan_end
            scanned = True


def _strip_png(data: bytes) -> bytes:
    """Keep the picture chunks; every chunk's CRC must be right, the header sane, and there
    must be image data before the end chunk."""
    out = bytearray(PNG_SIGNATURE)
    pos = len(PNG_SIGNATURE)
    first = True
    has_data = False
    while pos + 12 <= len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        end = pos + 12 + length
        if end > len(data) or (first and kind != b"IHDR"):
            raise ReceiptError("image_type")
        body = data[pos + 8 : pos + 8 + length]
        (crc,) = struct.unpack(">I", data[end - 4 : end])
        if zlib.crc32(kind + body) & 0xFFFFFFFF != crc:
            raise ReceiptError("image_type")
        if first:
            if length != 13:
                raise ReceiptError("image_type")
            width, height = struct.unpack(">II", body[:8])
            if not (0 < width <= MAX_SIDE and 0 < height <= MAX_SIDE):
                raise ReceiptError("image_type")
        first = False
        if kind == b"IDAT":
            has_data = True
        if kind in PNG_KEEP:
            out += data[pos:end]
        pos = end
        if kind == b"IEND":
            if not has_data:
                raise ReceiptError("image_type")
            return bytes(out)
    raise ReceiptError("image_type")


def clean_image(data: bytes) -> tuple[str, bytes]:
    """The image's type and its bytes without metadata, or ReceiptError (never another error)."""
    try:
        if data.startswith(b"\xff\xd8\xff"):
            return "jpg", _strip_jpeg(data)
        if data.startswith(PNG_SIGNATURE):
            return "png", _strip_png(data)
    except IndexError, struct.error, ValueError:
        raise ReceiptError("image_type") from None
    raise ReceiptError("image_type")


def receipt_path(org_id: Any, ext: str) -> str:
    return f"{org_id}/{uuid.uuid4().hex}.{ext}"


@transaction.atomic
def save_receipt(order_id: Any, upload: Any) -> Order:
    """The customer attaches the transfer's photo (while the transfer is open or being checked)."""
    order: Order = Order.objects.select_for_update().get(pk=order_id)
    if order.payment_method != Order.PaymentMethod.BANK:
        raise ReceiptError("not_prepaid")
    if order.status in payments.CLOSED_ORDER or order.payment_status not in OPEN_STATUSES:
        raise ReceiptError("payment_not_open")
    if upload.size is None or upload.size > MAX_BYTES:
        raise ReceiptError("image_too_large")
    ext, data = clean_image(upload.read())
    if order.payment_receipt:
        order.payment_receipt.delete(save=False)
    order.payment_receipt.save(
        receipt_path(order.organization_id, ext), ContentFile(data), save=False
    )
    order.save(update_fields=["payment_receipt", "updated_at"])
    OrderPaymentEvent.objects.create(order=order, kind=OrderPaymentEvent.Kind.RECEIPT)
    return order


def viewed(order: Order, actor: Any) -> None:
    record("receipt_view", "order", order.pk, actor=actor, branch=order.branch)


def purge_old(days: int | None = None) -> int:
    """Delete receipts of orders closed more than `days` ago (the row keeps its reference)."""
    keep = days if days is not None else settings.RECEIPT_RETENTION_DAYS
    cutoff = timezone.now() - dt.timedelta(days=keep)
    # From the day the order closed, not its last edit: a later note never extends the keep.
    old = Order.objects.filter(
        status__in=list(payments.CLOSED_ORDER), closed_at__lt=cutoff
    ).exclude(payment_receipt="")
    count = 0
    for order in old:
        order.payment_receipt.delete(save=False)
        order.payment_receipt = ""
        order.save(update_fields=["payment_receipt"])
        count += 1
    return count
