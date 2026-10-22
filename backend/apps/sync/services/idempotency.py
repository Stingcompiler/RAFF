"""Idempotency-Key handling for posting endpoints (CLAUDE.md rule 6).

Same key + same payload → the stored result, no second effect.
Same key + different payload → 409.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from typing import Any

from django.db import IntegrityError, transaction

from apps.sync.models import IdempotencyRecord


class KeyMissing(Exception):
    pass


class KeyConflict(Exception):
    pass


class KeyRace(Exception):
    """Another request with the same key committed first; the caller's transaction must
    roll back, then `replay()` returns the winner's result."""


def payload_hash(payload: Any) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def run_once(
    scope: str, key: str | None, payload: Any, action: Callable[[], dict[str, Any]]
) -> dict[str, Any]:
    """Run `action` once per (scope, key) inside the caller's transaction.

    Must be called inside `transaction.atomic()`: the record and the effect commit together,
    so a failed posting leaves no record and can be retried with the same key.
    """
    if not key or len(key) > 100:
        raise KeyMissing
    digest = payload_hash(payload)
    existing = IdempotencyRecord.objects.select_for_update().filter(scope=scope, key=key).first()
    if existing is not None:
        if existing.request_hash != digest:
            raise KeyConflict
        return dict(existing.response)
    result = action()
    try:
        with transaction.atomic():
            IdempotencyRecord.objects.create(
                scope=scope, key=key, request_hash=digest, response=result
            )
    except IntegrityError:
        raise KeyRace from None
    return result


def replay(scope: str, key: str, payload: Any) -> dict[str, Any]:
    """After a KeyRace (outside the rolled-back transaction): the stored result, or KeyConflict."""
    record = IdempotencyRecord.objects.get(scope=scope, key=key)
    if record.request_hash != payload_hash(payload):
        raise KeyConflict
    return dict(record.response)
