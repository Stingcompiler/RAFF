from __future__ import annotations

from django.db import transaction

from apps.sync.models import DocumentSequence


def next_number(name: str, prefix: str, width: int = 6) -> str:
    """Next number in the sequence; locked until the posting transaction commits."""
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("next_number must run inside the posting transaction")
    DocumentSequence.objects.get_or_create(name=name)
    seq = DocumentSequence.objects.select_for_update().get(name=name)
    value = seq.next_value
    seq.next_value = value + 1
    seq.save(update_fields=["next_value"])
    return f"{prefix}-{value:0{width}d}"
