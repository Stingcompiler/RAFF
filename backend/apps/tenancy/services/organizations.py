"""Creating the deployment's organization (install time only)."""

from __future__ import annotations

import uuid

from django.db import transaction

from apps.tenancy.context import org_context
from apps.tenancy.models import Organization


@transaction.atomic
def create_organization(name: str, org_id: uuid.UUID | None = None) -> Organization:
    org = Organization.objects.create(id=org_id or uuid.uuid4(), name=name)
    from apps.accounts.services.users import ensure_default_roles

    with org_context(org.id):
        ensure_default_roles()
    return org
