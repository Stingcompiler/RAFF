from __future__ import annotations

import uuid
from typing import Any

from apps.accounts.models import User
from apps.audit.models import AuditEvent
from apps.tenancy.models import Branch


def record(
    action: str,
    object_type: str,
    object_id: uuid.UUID,
    *,
    actor: User | None,
    branch: Branch | None = None,
    **data: Any,
) -> AuditEvent:
    event: AuditEvent = AuditEvent.objects.create(
        action=action,
        object_type=object_type,
        object_id=object_id,
        actor=actor,
        branch=branch,
        data=data,
    )
    return event
