from __future__ import annotations

import uuid

from django.db import models

from apps.tenancy.models import OrgScopedModel


class Notification(OrgScopedModel):
    """Something staff should see (the sidebar badge), plus its outbound delivery."""

    class Channel(models.TextChoices):
        BADGE = "badge", "Workspace badge"
        TELEGRAM = "telegram", "Telegram"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=30)
    object_id = models.UUIDField()
    channel = models.CharField(max_length=10, choices=Channel.choices)
    text = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    error = models.CharField(max_length=200, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.kind}:{self.channel}"
