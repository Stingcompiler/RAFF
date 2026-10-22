from __future__ import annotations

import uuid

from django.db import models

from apps.tenancy.models import OrgScopedModel


class AuditEvent(OrgScopedModel):
    """Who did what to which document, and when. Append-only."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        "accounts.User", null=True, on_delete=models.PROTECT, related_name="+"
    )
    action = models.CharField(max_length=40)
    object_type = models.CharField(max_length=30)
    object_id = models.UUIDField()
    branch = models.ForeignKey(
        "tenancy.Branch", null=True, on_delete=models.PROTECT, related_name="+"
    )
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["object_type", "object_id"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.action}:{self.object_type}:{self.object_id}"
