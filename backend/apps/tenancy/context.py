"""Current-organization context.

The organization is resolved once per request by ``OrgContextMiddleware`` and
held in a context variable. Today it comes from ``settings.SINGLE_ORG_ID``; a
SaaS deployment swaps ``resolve_org_id`` for a domain/session resolver without
touching services or selectors.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

_current_org_id: ContextVar[uuid.UUID | None] = ContextVar("current_org_id", default=None)


class OrgContextMissing(RuntimeError):
    """Raised when org-scoped data is touched outside an organization context."""


def resolve_org_id() -> uuid.UUID | None:
    """Return the organization for this deployment, or None if not configured."""
    raw = getattr(settings, "SINGLE_ORG_ID", None)
    if not raw:
        return None
    try:
        return uuid.UUID(str(raw))
    except ValueError as exc:
        raise ImproperlyConfigured("SINGLE_ORG_ID must be a UUID") from exc


def get_current_org_id() -> uuid.UUID:
    org_id = _current_org_id.get()
    if org_id is None:
        raise OrgContextMissing("No organization in context")
    return org_id


def peek_current_org_id() -> uuid.UUID | None:
    return _current_org_id.get()


@contextmanager
def org_context(org_id: uuid.UUID) -> Iterator[None]:
    """Run a block (task, command, test) inside an organization context."""
    token = _current_org_id.set(org_id)
    try:
        yield
    finally:
        _current_org_id.reset(token)
