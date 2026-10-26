"""Sign-in, sign-out and the branch/counter a session works in."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.core.cache import cache
from django.http import HttpRequest

from apps.accounts.models import User
from apps.tenancy.models import Branch, Device

BRANCH_KEY = "raff_branch_id"
DEVICE_KEY = "raff_device_id"


class InvalidCredentials(Exception):
    pass


class AccountLocked(Exception):
    pass


class ContextNotAllowed(Exception):
    pass


@dataclass(frozen=True)
class WorkContext:
    branch: Branch | None
    device: Device | None


def _keys(username: str) -> tuple[str, str]:
    from apps.tenancy.context import get_current_org_id

    who = f"{get_current_org_id()}:{username.strip().casefold()}"
    return f"raff:login-fail:{who}", f"raff:login-lock:{who}"


def clear_login_lock(username: str) -> None:
    """Forget failed sign-ins and lift a lock (a password reset starts the account clean)."""
    cache.delete_many(list(_keys(username)))


def sign_in(request: HttpRequest, username: str, password: str) -> User:
    """Authenticate; after RAFF_LOGIN_MAX_FAILURES wrong passwords the username is locked
    for RAFF_LOGIN_LOCK_MINUTES (the right password does not unlock it early)."""
    failures_key, lock_key = _keys(username)
    if cache.get(lock_key):
        raise AccountLocked
    user = authenticate(request, username=username, password=password)
    if not isinstance(user, User):
        window = settings.RAFF_LOGIN_LOCK_MINUTES * 60
        cache.add(failures_key, 0, timeout=window)
        if cache.incr(failures_key) >= settings.RAFF_LOGIN_MAX_FAILURES:
            cache.set(lock_key, True, timeout=window)
            cache.delete(failures_key)
            from apps.audit.services.log import record
            from apps.tenancy.context import get_current_org_id

            record("locked", "login", get_current_org_id(), actor=None, username=username[:60])
            raise AccountLocked
        raise InvalidCredentials
    cache.delete(failures_key)
    login(request, user)  # rotates the session key and CSRF token
    return user


def sign_out(request: HttpRequest) -> None:
    logout(request)  # flushes the session server-side


def choose_context(
    request: HttpRequest, user: User, branch_id: uuid.UUID, device_id: uuid.UUID | None
) -> WorkContext:
    branch = user.branches().filter(pk=branch_id).first()
    if branch is None:
        raise ContextNotAllowed("branch")
    device = None
    if device_id is not None:
        device = Device.objects.filter(pk=device_id, branch=branch, is_active=True).first()
        if device is None:
            raise ContextNotAllowed("device")
    request.session[BRANCH_KEY] = str(branch.pk)
    request.session[DEVICE_KEY] = str(device.pk) if device else None
    return WorkContext(branch, device)


def default_context(request: HttpRequest, user: User, device: Device | None) -> WorkContext:
    """After sign-in: this browser's registered counter if allowed, else the only branch."""
    if device is not None:
        try:
            return choose_context(request, user, device.branch_id, device.pk)
        except ContextNotAllowed:
            pass
    branches = list(user.branches()[:2])
    if len(branches) == 1:
        return choose_context(request, user, branches[0].pk, None)
    return WorkContext(None, None)


def current_context(request: HttpRequest, user: User) -> WorkContext:
    branch_id = request.session.get(BRANCH_KEY)
    device_id = request.session.get(DEVICE_KEY)
    branch = user.branches().filter(pk=branch_id).first() if branch_id else None
    device = (
        Device.objects.filter(pk=device_id, branch=branch, is_active=True).first()
        if branch and device_id
        else None
    )
    return WorkContext(branch, device)
