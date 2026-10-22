"""Business "today". Tests can pin it (RAFF_FIXED_TODAY, honoured only by dev/test settings)
so expiry statuses and price dates in screenshots do not drift with the calendar."""

from __future__ import annotations

import datetime as dt

from django.conf import settings
from django.utils import timezone


def today() -> dt.date:
    fixed = getattr(settings, "RAFF_FIXED_TODAY", None)
    return dt.date.fromisoformat(fixed) if fixed else timezone.localdate()
