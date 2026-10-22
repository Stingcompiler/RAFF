"""User administration: create users, set roles, activate/deactivate."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from django.contrib.auth.password_validation import validate_password
from django.db import transaction

from apps.accounts.models import Role, RoleAssignment, User
from apps.accounts.permissions import DEFAULT_ROLES
from apps.tenancy.models import Branch


class UserError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def ensure_default_roles() -> list[Role]:
    roles = []
    for code, (name_ar, name_en, perms) in DEFAULT_ROLES.items():
        role, _ = Role.objects.get_or_create(
            code=code,
            defaults={"name_ar": name_ar, "name_en": name_en, "permissions": sorted(perms)},
        )
        roles.append(role)
    return roles


@transaction.atomic
def set_assignments(user: User, assignments: Iterable[tuple[uuid.UUID, uuid.UUID | None]]) -> None:
    """Replace the user's roles with (role_id, branch_id or None) pairs."""
    pairs = list(assignments)
    roles = {r.pk: r for r in Role.objects.filter(pk__in=[r for r, _ in pairs])}
    branches = {b.pk: b for b in Branch.objects.filter(pk__in=[b for _, b in pairs if b])}
    if len(roles) != len({r for r, _ in pairs}) or len(branches) != len({b for _, b in pairs if b}):
        raise UserError("unknown_role_or_branch")
    RoleAssignment.objects.filter(user=user).delete()
    for role_id, branch_id in pairs:
        RoleAssignment.objects.create(
            user=user, role=roles[role_id], branch=branches[branch_id] if branch_id else None
        )


@transaction.atomic
def create_user(
    *,
    username: str,
    password: str,
    display_name_ar: str,
    display_name_en: str,
    assignments: Iterable[tuple[uuid.UUID, uuid.UUID | None]],
) -> User:
    if User.objects.filter(username=username.strip().lower()).exists():
        raise UserError("username_taken")
    validate_password(password)
    user = User.objects.create_user(
        username, password, display_name_ar=display_name_ar, display_name_en=display_name_en
    )
    set_assignments(user, assignments)
    return user


def set_active(user: User, active: bool, *, acting: User) -> User:
    if user.pk == acting.pk and not active:
        raise UserError("cannot_deactivate_self")
    user.is_active = active
    user.save(update_fields=["is_active"])
    return user


def set_password(user: User, password: str) -> None:
    validate_password(password, user)
    user.set_password(password)
    user.save(update_fields=["password"])
