from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.accounts.models import User
from apps.sales.models import HeldSale
from apps.tenancy.models import Device


def hold(device: Device, user: User, cart: list[dict[str, Any]], total: Decimal) -> HeldSale:
    held: HeldSale = HeldSale.objects.create(
        branch=device.branch, device=device, created_by=user, cart=cart, total=total
    )
    return held


def resume(held: HeldSale) -> list[dict[str, Any]]:
    cart = list(held.cart)
    held.delete()
    return cart
