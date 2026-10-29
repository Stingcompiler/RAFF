"""The owner role holds every permission (review B-10).

Roles store their permission list, so an organization created before a new permission (such
as `deliveries.handle`) kept an owner without it. Other roles may have been customized and
are left alone.
"""

from django.db import migrations

ALL = [
    "pos.sell",
    "pos.discount",
    "shifts.manage",
    "inventory.view",
    "inventory.manage",
    "purchasing.receive",
    "returns.create",
    "quarantine.decide",
    "stocktake.approve",
    "transfers.manage",
    "finance.view",
    "finance.manage",
    "reports.view",
    "orders.manage",
    "deliveries.handle",
    "storefront.manage",
    "settings.manage",
    "users.manage",
]


def grant(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    for role in Role.objects.filter(code="owner"):
        missing = sorted(set(ALL) - set(role.permissions))
        if missing:
            role.permissions = sorted(set(role.permissions) | set(ALL))
            role.save(update_fields=["permissions"])


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_courier_role")]
    operations = [migrations.RunPython(grant, migrations.RunPython.noop)]
