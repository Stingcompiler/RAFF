"""Counter devices: a registered browser carries a random token in an HttpOnly cookie."""

from __future__ import annotations

import hashlib
import secrets

from django.db import transaction
from django.utils import timezone

from apps.tenancy.models import Branch, Device


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@transaction.atomic
def register_device(device: Device) -> str:
    """Issue a new token for `device` (any previous browser loses it). Returns the token."""
    token = secrets.token_urlsafe(32)
    device.token_hash = _hash(token)
    device.registered_at = timezone.now()
    device.save(update_fields=["token_hash", "registered_at"])
    return token


def create_device(branch: Branch, name_ar: str, name_en: str) -> Device:
    device: Device = Device.objects.create(branch=branch, name_ar=name_ar, name_en=name_en)
    return device


def device_for_token(token: str | None) -> Device | None:
    if not token:
        return None
    return (
        Device.objects.select_related("branch")
        .filter(token_hash=_hash(token), is_active=True, branch__is_active=True)
        .first()
    )
