"""Money: Decimal in Python, NUMERIC(18,4) in Postgres, decimal strings on the wire."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import models

QUANT = Decimal("0.0001")


class MoneyField(models.DecimalField):  # type: ignore[type-arg]
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("max_digits", 18)
        kwargs.setdefault("decimal_places", 4)
        super().__init__(*args, **kwargs)

    def deconstruct(self) -> Any:
        name, _path, args, kwargs = super().deconstruct()
        return name, "django.db.models.DecimalField", args, kwargs


def money(value: Decimal | int | str) -> Decimal:
    """Round to the stored precision (4 places, half up). Rounding happens only in services."""
    return Decimal(value).quantize(QUANT, rounding=ROUND_HALF_UP)
