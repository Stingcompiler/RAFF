"""Shared test data helpers."""

from __future__ import annotations

from dataclasses import dataclass

from apps.accounts.models import Role, User
from apps.accounts.services.users import create_user
from apps.tenancy.models import Branch, Device, Organization

PASSWORD = "correct-horse-42"


@dataclass
class World:
    org: Organization
    khartoum: Branch
    omdurman: Branch
    counter: Device
    owner: User
    cashier: User


def make_user(username: str, role: str, branch: Branch | None) -> User:
    return create_user(
        username=username,
        password=PASSWORD,
        display_name_ar=username,
        display_name_en=username,
        assignments=[(Role.objects.get(code=role).pk, branch.pk if branch else None)],
    )
