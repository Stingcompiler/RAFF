from __future__ import annotations

from typing import Any

from django.contrib.auth.backends import BaseBackend
from django.http import HttpRequest

from .models import User


class OrgUserBackend(BaseBackend):
    """Username + password within the organization in context."""

    def authenticate(
        self,
        request: HttpRequest | None,
        username: str | None = None,
        password: str | None = None,
        **kwargs: Any,
    ) -> User | None:
        if not username or password is None:
            return None
        user = User.objects.filter(username=username.strip().lower()).first()
        if user is None:
            # Same cost as a real check, so timing does not reveal valid usernames.
            User().set_password(password)
            return None
        if user.is_active and user.check_password(password):
            return user
        return None

    def get_user(self, user_id: Any) -> User | None:
        return User.objects.filter(pk=user_id, is_active=True).first()
