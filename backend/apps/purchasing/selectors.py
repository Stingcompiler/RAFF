# Read-side queries for this app. All reads go through OrgScopedQuerySet.
from __future__ import annotations

from decimal import Decimal

from apps.finance.money import money
from apps.purchasing.models import GoodsReceipt


def bonus_allocated(receipt: GoodsReceipt) -> Decimal:
    """Value of the bonus units at their invoice unit cost (shown on the receipt)."""
    return sum(
        (money(Decimal(line.bonus_quantity) * line.unit_cost) for line in receipt.lines.all()),
        Decimal(0),
    )
