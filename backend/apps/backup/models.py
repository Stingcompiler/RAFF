from __future__ import annotations

import uuid

from django.db import models

from apps.tenancy.models import OrgScopedModel


class BackupRun(OrgScopedModel):
    """One backup or restore drill, recorded by infra/backup scripts (shown in Settings)."""

    class Kind(models.TextChoices):
        BACKUP = "backup", "Backup"
        RESTORE_TEST = "restore_test", "Restore test"

    class Status(models.TextChoices):
        OK = "ok", "Succeeded"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    status = models.CharField(max_length=6, choices=Status.choices)
    file = models.CharField(max_length=200, blank=True)
    size_bytes = models.BigIntegerField(default=0)
    offsite = models.BooleanField(default=False)
    detail = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.kind}:{self.status}:{self.created_at:%Y-%m-%d %H:%M}"
