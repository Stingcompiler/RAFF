"""Sign-in, sign-out and the branch/counter a session works in."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from django.contrib.auth import authenticate, login, logout
from django.http import HttpRequest

from apps.accounts.models import User
from apps.tenancy.models import Branch, Device

BRANCH_KEY = "raff_branch_id"
DEVICE_KEY = "raff_device_id"


class InvalidCredentials(Exception):
    pass


class ContextNotAllowed(Exception):
    pass


@dataclass(frozen=True)
class WorkContext:
    branch: Branch | None
    device: Device | None


def sign_in(request: HttpRequest, username: str, password: str) -> User:
    user = authenticate(request, username=username, password=password)
    if not isinstance(user, User):
        raise InvalidCredentials
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
