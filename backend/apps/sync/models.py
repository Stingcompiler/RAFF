from __future__ import annotations

import uuid

from django.db import models

from apps.tenancy.models import OrgScopedModel


class IdempotencyRecord(OrgScopedModel):
    """One posting request per key: same key + same payload replays the stored result."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope = models.CharField(max_length=40)
    key = models.CharField(max_length=100)
    request_hash = models.CharField(max_length=64)
    response = models.JSONField()
    status_code = models.PositiveSmallIntegerField(default=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "scope", "key"], name="idempotency_key_unique"
            )
        ]

    def __str__(self) -> str:
        return f"{self.scope}:{self.key}"


class DocumentSequence(OrgScopedModel):
    """Gap-free document numbers per organization (GR-000001, INV-000001, …)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=20)
    next_value = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "name"], name="sequence_name_unique")
        ]

    def __str__(self) -> str:
        return f"{self.name}:{self.next_value}"
