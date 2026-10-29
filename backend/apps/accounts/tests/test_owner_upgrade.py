"""Review B-10: an owner created before a new permission gets it on upgrade."""

from __future__ import annotations

import importlib

import pytest
from django.apps import apps

from apps.accounts.models import Role
from apps.accounts.permissions import ALL
from apps.tenancy.context import org_context
from tests.factories import World

pytestmark = pytest.mark.django_db


def test_b10_the_owner_role_gains_permissions_added_after_it_was_created(world: World) -> None:
    upgrade = importlib.import_module("apps.accounts.migrations.0003_owner_all_permissions")
    with org_context(world.org.id):
        owner = Role.objects.get(code="owner")
        owner.permissions = sorted(set(ALL) - {"deliveries.handle"})
        owner.save(update_fields=["permissions"])
        cashier = Role.objects.get(code="cashier")
        before = list(cashier.permissions)
    upgrade.grant(apps, None)
    with org_context(world.org.id):
        assert set(Role.objects.get(code="owner").permissions) == set(ALL)
        assert Role.objects.get(code="cashier").permissions == before  # custom roles untouched
