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


class Branch(OrgScopedModel):
    """A pharmacy branch of the organization."""

    class DeploymentMode(models.TextChoices):
        CENTRAL = "central", "Central server"
        LOCAL_NODE = "local_node", "Local branch node"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20)
    name_ar = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    city_ar = models.CharField(max_length=80, blank=True)
    city_en = models.CharField(max_length=80, blank=True)
    receipt_locale = models.CharField(
        max_length=2, choices=[("ar", "ar"), ("en", "en")], default="ar"
    )
    deployment_mode = models.CharField(
        max_length=20, choices=DeploymentMode.choices, default=DeploymentMode.CENTRAL
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="branch_code_per_org"),
        ]
        ordering = ["code"]

    def __str__(self) -> str:
        return self.name_en


class Device(OrgScopedModel):
    """A registered counter computer. Its browser holds the token in an HttpOnly cookie."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="devices")
    name_ar = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80)
    # SHA-256 of the device token; the token itself is never stored.
    token_hash = models.CharField(max_length=64, blank=True)
    registered_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "branch", "name_en"], name="device_name_per_branch"
            ),
            models.UniqueConstraint(
                fields=["organization", "token_hash"],
                name="device_token_per_org",
                condition=~models.Q(token_hash=""),
            ),
        ]
        ordering = ["name_en"]

    def __str__(self) -> str:
        return self.name_en
