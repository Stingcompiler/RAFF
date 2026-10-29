"""The photo of a bank transfer's confirmation (D-R0021, WO-30b).

Receipts show account numbers and names, so they are kept in a private directory, read only by
staff through an authenticated endpoint, stripped of metadata (phone photos carry GPS), limited
to JPEG and PNG, and deleted a while after the order is closed.
"""

from __future__ import annotations

import datetime as dt
import struct
import uuid
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


def _strip_jpeg(data: bytes) -> bytes:
    out = bytearray(b"\xff\xd8")
    pos = 2
    while pos < len(data):
        if data[pos] != 0xFF:
            raise ReceiptError("image_type")
        while pos < len(data) and data[pos] == 0xFF:  # fill bytes
            pos += 1
        marker = data[pos]
        pos += 1
        if marker == 0xD9:  # EOI
            out += b"\xff\xd9"
            return bytes(out)
        if marker == 0xDA:  # start of scan: the rest is picture data
            out += b"\xff\xda" + data[pos:]
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
        is_app = 0xE0 <= marker <= 0xEF
        if (is_app and marker not in JPEG_KEEP_APP) or marker == 0xFE:
            pass  # EXIF, XMP, Photoshop, comments
        else:
            out += bytes([0xFF, marker]) + data[pos:end]
        pos = end
    raise ReceiptError("image_type")


def _strip_png(data: bytes) -> bytes:
    out = bytearray(PNG_SIGNATURE)
    pos = len(PNG_SIGNATURE)
    first = True
    while pos + 8 <= len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        end = pos + 12 + length
        if end > len(data) or (first and kind != b"IHDR"):
            raise ReceiptError("image_type")
        first = False
        if kind in PNG_KEEP:
            out += data[pos:end]
        pos = end
        if kind == b"IEND":
            return bytes(out)
    raise ReceiptError("image_type")


def clean_image(data: bytes) -> tuple[str, bytes]:
    """The image's type and its bytes without metadata, or ReceiptError."""
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg", _strip_jpeg(data)
    if data.startswith(PNG_SIGNATURE):
        return "png", _strip_png(data)
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
    old = Order.objects.filter(
        status__in=list(payments.CLOSED_ORDER), updated_at__lt=cutoff
    ).exclude(payment_receipt="")
    count = 0
    for order in old:
        order.payment_receipt.delete(save=False)
        order.payment_receipt = ""
        order.save(update_fields=["payment_receipt"])
        count += 1
    return count
