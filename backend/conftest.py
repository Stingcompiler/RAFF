"""Fixtures shared by every test package."""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from django.test import override_settings

from apps.tenancy.context import org_context
from apps.tenancy.models import Branch, Device
from apps.tenancy.services.organizations import create_organization
from tests.factories import World, make_user


@pytest.fixture
def world(db: None) -> Iterator[World]:
    """One organization with two branches, a counter, an owner and a Khartoum cashier."""
    org = create_organization("Test pharmacy")
    with override_settings(SINGLE_ORG_ID=str(org.id)), org_context(org.id):
        krt = Branch.objects.create(code="KRT", name_ar="الخرطوم", name_en="Khartoum")
        omd = Branch.objects.create(code="OMD", name_ar="أم درمان", name_en="Omdurman")
        counter = Device.objects.create(branch=krt, name_ar="كاونتر 1", name_en="Counter 1")
        owner = make_user("owner", "owner", None)
        cashier = make_user("salma", "cashier", krt)
        yield World(org, krt, omd, counter, owner, cashier)


@pytest.fixture
def other_org_branch(world: World) -> Branch:
    """A branch belonging to a different organization."""
    other = create_organization("Another pharmacy", uuid.uuid4())
    with org_context(other.id):
        branch: Branch = Branch.objects.create(code="KRT", name_ar="فرع", name_en="Other")
    return branch
