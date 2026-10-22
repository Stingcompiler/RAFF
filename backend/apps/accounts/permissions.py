"""Permission codes. Roles hold a list of these; views check them."""

from __future__ import annotations

from typing import Final

PERMISSIONS: Final[dict[str, str]] = {
    "pos.sell": "Sell at the counter",
    "pos.discount": "Give line discounts",
    "shifts.manage": "Open and close shifts",
    "inventory.view": "View items and stock",
    "inventory.manage": "Edit items, prices and adjustments",
    "purchasing.receive": "Receive and approve purchases",
    "returns.create": "Create returns",
    "quarantine.decide": "Decide on quarantined stock (responsible pharmacist)",
    "stocktake.approve": "Approve stocktakes",
    "transfers.manage": "Send and receive branch transfers",
    "finance.view": "View balances and payments",
    "finance.manage": "Record payments and verify bank transfers",
    "reports.view": "View reports",
    "orders.manage": "Handle storefront orders",
    "storefront.manage": "Manage the public storefront",
    "settings.manage": "Manage pharmacy settings, branches and devices",
    "users.manage": "Manage users and roles",
}

ALL: Final[frozenset[str]] = frozenset(PERMISSIONS)

# Default roles created for a new organization (codes are stable identifiers).
DEFAULT_ROLES: Final[dict[str, tuple[str, str, frozenset[str]]]] = {
    "owner": ("المالك", "Owner", ALL),
    "pharmacist": (
        "صيدلي",
        "Pharmacist",
        frozenset(
            {
                "pos.sell",
                "pos.discount",
                "shifts.manage",
                "inventory.view",
                "returns.create",
                "quarantine.decide",
                "stocktake.approve",
                "orders.manage",
                "reports.view",
            }
        ),
    ),
    "cashier": (
        "كاشير",
        "Cashier",
        frozenset(
            {"pos.sell", "shifts.manage", "inventory.view", "returns.create", "orders.manage"}
        ),
    ),
    "inventory": (
        "مسؤول مخزون",
        "Inventory clerk",
        frozenset(
            {
                "inventory.view",
                "inventory.manage",
                "purchasing.receive",
                "transfers.manage",
                "stocktake.approve",
            }
        ),
    ),
    "accountant": (
        "محاسب",
        "Accountant",
        frozenset({"inventory.view", "finance.view", "finance.manage", "reports.view"}),
    ),
}
