"""Tell staff about storefront orders: always the workspace badge, Telegram when configured."""

from __future__ import annotations

import json
import logging
import urllib.request
import uuid

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.notifications.models import Notification

log = logging.getLogger(__name__)


def order_placed(order_id: uuid.UUID, text: str, telegram_chat_id: str) -> None:
    Notification.objects.create(
        kind="order_new", object_id=order_id, channel=Notification.Channel.BADGE, text=text
    )
    if settings.RAFF_TELEGRAM_BOT_TOKEN and telegram_chat_id:
        note = Notification.objects.create(
            kind="order_new", object_id=order_id, channel=Notification.Channel.TELEGRAM, text=text
        )
        transaction.on_commit(lambda: _telegram(note.pk, telegram_chat_id, text))


def inquiry_received(inquiry_id: uuid.UUID, text: str, telegram_chat_id: str) -> None:
    Notification.objects.create(
        kind="inquiry_new", object_id=inquiry_id, channel=Notification.Channel.BADGE, text=text
    )
    if settings.RAFF_TELEGRAM_BOT_TOKEN and telegram_chat_id:
        note = Notification.objects.create(
            kind="inquiry_new",
            object_id=inquiry_id,
            channel=Notification.Channel.TELEGRAM,
            text=text,
        )
        transaction.on_commit(lambda: _telegram(note.pk, telegram_chat_id, text))


def unread_inquiries() -> int:
    return Notification.objects.filter(
        kind="inquiry_new", channel=Notification.Channel.BADGE, read_at__isnull=True
    ).count()


def _telegram(note_id: uuid.UUID, chat_id: str, text: str) -> None:
    """Best effort after commit: a failure is recorded on the notification, never raised."""
    url = f"https://api.telegram.org/bot{settings.RAFF_TELEGRAM_BOT_TOKEN}/sendMessage"
    body = json.dumps({"chat_id": chat_id, "text": text}).encode()
    request = urllib.request.Request(url, data=body, headers={"content-type": "application/json"})
    error = ""
    try:
        with urllib.request.urlopen(request, timeout=5) as response:  # noqa: S310 (fixed https URL)
            response.read()
    except Exception as exc:  # network errors must not break order placement
        error = str(exc)[:200]
        log.warning("telegram notification failed: %s", error)
    Notification.objects.filter(pk=note_id).update(sent_at=timezone.now(), error=error)


def unread_orders() -> int:
    return Notification.objects.filter(
        kind="order_new", channel=Notification.Channel.BADGE, read_at__isnull=True
    ).count()


def mark_read(order_id: uuid.UUID) -> None:
    Notification.objects.filter(object_id=order_id, read_at__isnull=True).update(
        read_at=timezone.now()
    )


def ops_alert(kind: str, text: str) -> None:
    """Operations alert (backup failed, errors piling up): badge record + Telegram if set.
    Never raises: alerting must not break the caller."""
    try:
        from apps.storefront.models import StorefrontSettings
        from apps.tenancy.context import org_context, resolve_org_id

        org_id = resolve_org_id()
        if org_id is None:
            return
        with org_context(org_id):
            note = Notification.objects.create(
                kind=kind, object_id=org_id, channel=Notification.Channel.BADGE, text=text[:500]
            )
            chat = (StorefrontSettings.objects.first() or StorefrontSettings()).telegram_chat_id
            if settings.RAFF_TELEGRAM_BOT_TOKEN and chat:
                _telegram(note.pk, chat, text)
    except Exception as exc:
        log.warning("ops alert failed: %s", exc)
