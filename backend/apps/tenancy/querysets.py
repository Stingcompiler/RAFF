from __future__ import annotations

from typing import TYPE_CHECKING, Any, TypeVar

from django.db import models

from .context import get_current_org_id

if TYPE_CHECKING:
    from .models import OrgScopedModel

_M = TypeVar("_M", bound="OrgScopedModel")


class OrgScopedQuerySet(models.QuerySet[_M]):
    """QuerySet that is always filtered to the organization in context."""

    def for_current_org(self) -> OrgScopedQuerySet[_M]:
        return self.filter(organization_id=get_current_org_id())


class OrgScopedManager(models.Manager[_M]):
    """Default manager for org-scoped models.

    Every queryset it returns is already filtered to the current organization;
    using it with no organization in context raises ``OrgContextMissing``.
    """

    def get_queryset(self) -> OrgScopedQuerySet[_M]:
        return OrgScopedQuerySet(self.model, using=self._db).for_current_org()

    def create(self, **kwargs: Any) -> _M:
        if "organization" in kwargs or "organization_id" in kwargs:
            raise ValueError("organization comes from OrgContext, not from caller data")
        return super().create(**kwargs)
