"""A visitor's question from the contact page (no account, no session)."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.notifications.services.notify import inquiry_received
from apps.orders.models import Inquiry
from apps.orders.services.placing import OrderError, normalize_phone
from apps.storefront.models import StorefrontSettings
from apps.sync.services.idempotency import run_once
from apps.sync.services.sequences import next_number

MAX_PER_HOUR = 5


def inquiry_payload(
    name: str, phone: str, topic: str, via: str, order_number: str, message: str, locale: str
) -> dict[str, Any]:
    return {
        "name": name.strip(),
        "phone": phone,
        "topic": topic,
        "via": via,
        "order_number": order_number.strip().upper(),
        "message": message.strip(),
        "locale": locale,
    }


def _create(payload: dict[str, Any], key: str) -> dict[str, Any]:
    since = timezone.now() - dt.timedelta(hours=1)
    if (
        Inquiry.objects.filter(phone=payload["phone"], created_at__gte=since).count()
        >= MAX_PER_HOUR
    ):
        raise OrderError("rate_limited")
    inquiry = Inquiry.objects.create(
        number=next_number("inquiry", "Q", width=4),
        customer_name=payload["name"],
        phone=payload["phone"],
        topic=payload["topic"],
        contact_via=payload["via"],
        order_number=payload["order_number"],
        message=payload["message"],
        locale=payload["locale"],
        idempotency_key=key,
    )
    chat = (StorefrontSettings.objects.first() or StorefrontSettings()).telegram_chat_id
    inquiry_received(
        inquiry.pk, f"{inquiry.number} · {inquiry.customer_name} · {inquiry.phone}", chat
    )
    return {"number": inquiry.number}


@transaction.atomic
def send_inquiry(
    *,
    name: str,
    phone: str,
    topic: str,
    via: str,
    order_number: str,
    message: str,
    locale: str,
    idempotency_key: str | None,
) -> dict[str, Any]:
    normalized = normalize_phone(phone)
    if normalized is None:
        raise OrderError("invalid_phone")
    if len(name.strip()) < 2:
        raise OrderError("invalid_name")
    if len(message.strip()) < 3:
        raise OrderError("invalid_message")
    if topic == Inquiry.Topic.ORDER and not order_number.strip():
        raise OrderError("order_number_required")
    payload = inquiry_payload(name, normalized, topic, via, order_number, message, locale)
    return run_once(
        "send_inquiry", idempotency_key, payload, lambda: _create(payload, idempotency_key or "")
    )


def set_status(inquiry: Inquiry, status: str, actor: Any) -> Inquiry:
    inquiry.status = status
    inquiry.handled_by = actor if status != Inquiry.Status.NEW else None
    inquiry.handled_at = timezone.now() if status != Inquiry.Status.NEW else None
    inquiry.save(update_fields=["status", "handled_by", "handled_at"])
    return inquiry
