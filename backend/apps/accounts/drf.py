"""DRF helpers: permission-code checks against the session's branch."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.accounts.models import User
from apps.accounts.services.session import current_context


def has_code(request: Request, code: str) -> bool:
    user = request.user
    if not isinstance(user, User) or not user.is_authenticated:
        return False
    branch = current_context(request._request, user).branch
    return code in user.permissions_for(branch)


def requires(code: str) -> type[BasePermission]:
    """Permission class requiring one permission code (see accounts/permissions.py)."""

    class _Requires(BasePermission):
        def has_permission(self, request: Request, view: Any) -> bool:
            return has_code(request, code)

    _Requires.__name__ = f"Requires_{code.replace('.', '_')}"
    return _Requires
