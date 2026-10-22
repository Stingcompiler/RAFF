from __future__ import annotations

import uuid
from typing import Any, ClassVar

from django.db import models

from .context import get_current_org_id
from .querysets import OrgScopedManager


class Organization(models.Model):
    """The customer organization. Exempt from scoping (see EXEMPT.md)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tenancy_organization"

    def __str__(self) -> str:
        return self.name


class OrgScopedModel(models.Model):
    """Base class for every model that holds customer data.

    The organization is taken from ``OrgContext`` on first save and can never
    be supplied or changed by callers.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name="+",
        db_index=True,
        editable=False,
    )

    organization_id: uuid.UUID | None

    objects: ClassVar[OrgScopedManager[Any]] = OrgScopedManager()

    class Meta:
        abstract = True

    def save(self, *args: Any, **kwargs: Any) -> None:
        current = get_current_org_id()
        if self.organization_id is None:
            self.organization_id = current
        elif self.organization_id != current:
            raise ValueError("Cannot save a row belonging to another organization")
        super().save(*args, **kwargs)
