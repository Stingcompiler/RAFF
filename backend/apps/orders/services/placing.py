"""A guest sends a review request from the storefront (no account, no session)."""

from __future__ import annotations

import datetime as dt
import re
import secrets
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Item
from apps.finance.money import money
from apps.notifications.services.notify import order_placed
from apps.orders.models import Order, OrderEvent, OrderLine
from apps.orders.services import payments
from apps.storefront.models import Listing, StorefrontSettings
from apps.storefront.selectors import current_prices
from apps.storefront.services.listings import sale_unit
from apps.sync.services.idempotency import run_once
from apps.sync.services.sequences import next_number

MAX_QTY = 20
MAX_LINES = 30
# Sudanese mobile numbers: 0912345678, +249912345678, 249912345678.
PHONE = re.compile(r"^(?:\+?249|0)?([19]\d{8})$")


class OrderError(Exception):
    def __init__(self, code: str, **detail: object) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class LineRequest:
    slug: str
    quantity: int


def normalize_phone(raw: str) -> str | None:
    match = PHONE.match(re.sub(r"[\s-]", "", raw))
    return f"0{match.group(1)}" if match else None


@dataclass(frozen=True)
class Place:
    """Where the customer is: a described place, and the device position when shared."""

    address: str
    latitude: Decimal | None = None
    longitude: Decimal | None = None


@dataclass(frozen=True)
class Terms:
    """How the order is handed over and paid for (D-R0021)."""

    fulfillment: str = "pickup"
    payment_method: str = "cod"
    payment_reference: str = ""
    paid_amount: Decimal | None = None


def check_terms(terms: Terms) -> Terms:
    if terms.fulfillment not in ("pickup", "delivery"):
        raise OrderError("invalid_fulfillment")
    if terms.payment_method not in ("cod", "bank"):
        raise OrderError("invalid_payment_method")
    if terms.payment_method == "cod":
        if terms.payment_reference.strip() or terms.paid_amount is not None:
            raise OrderError("cod_has_no_transfer")
        return Terms(terms.fulfillment, "cod")
    ref = payments.normalize_reference(terms.payment_reference)
    if not ref and terms.paid_amount is None:
        return Terms(terms.fulfillment, "bank")  # "I will transfer after you confirm"
    try:
        ref, amount = payments.check_details(ref, terms.paid_amount)
    except payments.PaymentError as exc:
        raise OrderError(exc.code) from None
    return Terms(terms.fulfillment, "bank", ref, amount)


def check_place(place: Place) -> Place:
    address = " ".join(place.address.split())
    if len(address) < 3:
        raise OrderError("invalid_address")
    if (place.latitude is None) != (place.longitude is None):
        raise OrderError("invalid_position")
    if (
        place.latitude is not None
        and place.longitude is not None
        and not (
            Decimal(-90) <= place.latitude <= Decimal(90)
            and Decimal(-180) <= place.longitude <= Decimal(180)
        )
    ):
        raise OrderError("invalid_position")
    return Place(address, place.latitude, place.longitude)


def order_payload(
    name: str, phone: str, note: str, lines: list[LineRequest], place: Place, terms: Terms
) -> dict[str, Any]:
    return {
        "fulfillment": terms.fulfillment,
        "payment_method": terms.payment_method,
        "payment_reference": terms.payment_reference,
        "paid_amount": str(terms.paid_amount) if terms.paid_amount is not None else None,
        "name": name.strip(),
        "phone": phone,
        "note": note.strip(),
        "address": " ".join(place.address.split()),
        "latitude": str(place.latitude) if place.latitude is not None else None,
        "longitude": str(place.longitude) if place.longitude is not None else None,
        "lines": sorted([li.slug, li.quantity] for li in lines),
    }


def _place(
    settings: StorefrontSettings,
    name: str,
    phone: str,
    note: str,
    lines: list[LineRequest],
    place: Place,
    terms: Terms,
    key: str,
) -> dict[str, Any]:
    if not settings.enabled or settings.branch_id is None:
        raise OrderError("store_closed")
    blocked = {normalize_phone(p) for p in settings.blocked_phones.splitlines() if p.strip()}
    if phone in blocked:
        raise OrderError("rate_limited")
    since = timezone.now() - dt.timedelta(hours=1)
    if Order.objects.filter(phone=phone, created_at__gte=since).count() >= settings.orders_per_hour:
        raise OrderError("rate_limited")
    if not lines or len(lines) > MAX_LINES:
        raise OrderError("no_lines")
    listings = {
        li.slug: li
        for li in Listing.objects.filter(
            slug__in=[r.slug for r in lines], published=True, item__is_active=True
        ).select_related("item")
    }
    for r in lines:
        if r.slug not in listings:
            raise OrderError("unknown_item", slug=r.slug)
        if not 1 <= r.quantity <= MAX_QTY:
            raise OrderError("invalid_quantity", slug=r.slug)
    prices = current_prices([listings[r.slug].item for r in lines])
    # Prescription items and items without a price have no final total yet, and are for
    # pharmacist review at the counter: no delivery, no prepayment (D-R0021).
    needs_review = any(
        listings[r.slug].item.classification == Item.Classification.RX
        or listings[r.slug].item.pk not in prices
        for r in lines
    )
    if terms.fulfillment == "delivery":
        if not settings.delivery_enabled:
            raise OrderError("delivery_unavailable")
        if needs_review:
            raise OrderError("delivery_pickup_only")
    if terms.payment_method == "bank":
        if not settings.prepay_enabled:
            raise OrderError("prepay_unavailable")
        if needs_review:
            raise OrderError("prepay_pickup_only")
    order = Order.objects.create(
        number=next_number("order", "O", width=4),
        token=secrets.token_urlsafe(32),
        branch_id=settings.branch_id,
        customer_name=name.strip(),
        phone=phone,
        note=note.strip()[:500],
        address=place.address,
        latitude=place.latitude,
        longitude=place.longitude,
        fulfillment=terms.fulfillment,
        payment_method=terms.payment_method,
        payment_status=(
            Order.PaymentStatus.AWAITING_PROOF
            if terms.payment_method == "bank"
            else Order.PaymentStatus.NONE
        ),
        idempotency_key=key,
    )
    total = Decimal(0)
    for r in lines:
        item = listings[r.slug].item
        rx = item.classification == Item.Classification.RX
        price = None if rx or item.pk not in prices else prices[item.pk].price
        unit = sale_unit(item)
        OrderLine.objects.create(
            order=order, item=item, unit=unit, quantity=r.quantity, published_price=price, rx=rx
        )
        if price is not None:
            total += price * r.quantity
    order.estimated_total = money(total)
    order.save(update_fields=["estimated_total"])
    OrderEvent.objects.create(order=order, status=Order.Status.NEW)
    if terms.payment_reference and terms.paid_amount is not None:
        try:
            payments.apply_submission(order, terms.payment_reference, terms.paid_amount)
        except payments.PaymentError as exc:
            raise OrderError(exc.code) from None
    order_placed(
        order.pk,
        f"{order.number} · {order.customer_name} · {phone} · {place.address} · {len(lines)}",
        settings.telegram_chat_id,
    )
    return {"number": order.number, "token": order.token, "status": order.status}


@transaction.atomic
def place_order(
    *,
    name: str,
    phone: str,
    note: str,
    lines: list[LineRequest],
    place: Place,
    terms: Terms | None = None,
    idempotency_key: str | None,
) -> dict[str, Any]:
    normalized = normalize_phone(phone)
    if normalized is None:
        raise OrderError("invalid_phone")
    if len(name.strip()) < 2:
        raise OrderError("invalid_name")
    place = check_place(place)
    terms = check_terms(terms or Terms())
    settings = StorefrontSettings.objects.first() or StorefrontSettings()
    return run_once(
        "place_order",
        idempotency_key,
        order_payload(name, normalized, note, lines, place, terms),
        lambda: _place(
            settings, name, normalized, note, lines, place, terms, idempotency_key or ""
        ),
    )
