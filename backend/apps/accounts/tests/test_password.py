"""Changing your own password and the owner resetting someone else's."""

from __future__ import annotations

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.tenancy.context import org_context
from tests.factories import PASSWORD, World

from .test_auth import csrf_client, login
from .test_users import signed_in

pytestmark = pytest.mark.django_db

NEW = "fresh-pass-2026-x"


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    cache.clear()


def post(client: APIClient, token: str, path: str, body: dict[str, object]):  # type: ignore[no-untyped-def]
    return client.post(path, body, format="json", HTTP_X_CSRFTOKEN=token)


def can_sign_in(username: str, password: str) -> bool:
    client = csrf_client()
    return bool(login(client, username, password).status_code == 200)


def user_id(client: APIClient, username: str) -> str:
    rows = client.get("/api/v1/users/").json()
    return str(next(u["id"] for u in rows if u["username"] == username))


# ---- change your own password --------------------------------------------------------------


def test_change_own_password_keeps_this_session_and_ends_the_others(world: World) -> None:
    here, token = signed_in("salma")
    elsewhere, _ = signed_in("salma")
    response = post(
        here,
        token,
        "/api/v1/auth/password/change/",
        {"current_password": PASSWORD, "new_password": NEW},
    )
    assert response.status_code == 204, response.content
    assert here.get("/api/v1/auth/me/").status_code == 200  # still signed in here
    assert elsewhere.get("/api/v1/auth/me/").status_code in (401, 403)  # ended there
    assert not can_sign_in("salma", PASSWORD)
    assert can_sign_in("salma", NEW)
    with org_context(world.org.id):
        assert AuditEvent.objects.filter(action="password_changed", object_type="user").count() == 1


def test_change_needs_the_right_current_password(world: World) -> None:
    client, token = signed_in("salma")
    response = post(
        client,
        token,
        "/api/v1/auth/password/change/",
        {"current_password": "not-my-password", "new_password": NEW},
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "wrong_current_password"}
    assert can_sign_in("salma", PASSWORD)


def test_change_rejects_a_weak_or_unchanged_password(world: World) -> None:
    client, token = signed_in("salma")
    weak = post(
        client,
        token,
        "/api/v1/auth/password/change/",
        {"current_password": PASSWORD, "new_password": "password"},
    )
    assert weak.status_code == 400 and "password" in weak.json()
    same = post(
        client,
        token,
        "/api/v1/auth/password/change/",
        {"current_password": PASSWORD, "new_password": PASSWORD},
    )
    assert same.json() == {"detail": "same_password"}


def test_change_needs_a_signed_in_user_and_csrf(world: World) -> None:
    anonymous = csrf_client()
    response = post(
        anonymous,
        anonymous.cookies["csrftoken"].value,
        "/api/v1/auth/password/change/",
        {"current_password": PASSWORD, "new_password": NEW},
    )
    assert response.status_code in (401, 403)
    client, _ = signed_in("salma")
    no_token = client.post(
        "/api/v1/auth/password/change/",
        {"current_password": PASSWORD, "new_password": NEW},
        format="json",
    )
    assert no_token.status_code == 403


# ---- the owner resets someone else's --------------------------------------------------------


def test_owner_resets_with_a_generated_password_shown_once(world: World) -> None:
    owner, token = signed_in("owner")
    salma_session, _ = signed_in("salma")
    target = user_id(owner, "salma")
    response = post(owner, token, f"/api/v1/users/{target}/reset-password/", {})
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["generated"] is True
    temporary = body["password"]
    assert len(temporary) >= 12 and not any(c in temporary for c in "0O1lI")
    assert not can_sign_in("salma", PASSWORD)
    assert can_sign_in("salma", temporary)
    assert salma_session.get("/api/v1/auth/me/").status_code in (401, 403)
    with org_context(world.org.id):
        event = AuditEvent.objects.get(action="password_reset", object_type="user")
        assert str(event.object_id) == target
        assert "password" not in str(event.data)  # the password itself is never logged


def test_owner_can_type_the_new_password_and_it_is_not_echoed(world: World) -> None:
    owner, token = signed_in("owner")
    target = user_id(owner, "salma")
    response = post(owner, token, f"/api/v1/users/{target}/reset-password/", {"password": NEW})
    assert response.json() == {"password": None, "generated": False}
    assert can_sign_in("salma", NEW)


def test_reset_validates_the_password(world: World) -> None:
    owner, token = signed_in("owner")
    target = user_id(owner, "salma")
    response = post(
        owner, token, f"/api/v1/users/{target}/reset-password/", {"password": "password"}
    )
    assert response.status_code == 400 and "password" in response.json()
    assert can_sign_in("salma", PASSWORD)


def test_you_cannot_reset_your_own_password_that_way(world: World) -> None:
    owner, token = signed_in("owner")
    me = user_id(owner, "owner")
    response = post(owner, token, f"/api/v1/users/{me}/reset-password/", {})
    assert response.status_code == 400
    assert response.json() == {"detail": "use_change_password"}


def test_only_users_managers_can_reset(world: World) -> None:
    cashier, token = signed_in("salma")
    owner, _ = signed_in("owner")
    target = user_id(owner, "salma")
    assert post(cashier, token, f"/api/v1/users/{target}/reset-password/", {}).status_code == 403
    assert can_sign_in("salma", PASSWORD)


def test_unknown_user_is_a_404(world: World) -> None:
    owner, token = signed_in("owner")
    missing = "00000000-0000-4000-8000-000000000000"
    assert post(owner, token, f"/api/v1/users/{missing}/reset-password/", {}).status_code == 404


@override_settings(RAFF_LOGIN_MAX_FAILURES=3)
def test_a_reset_unlocks_a_locked_account(world: World) -> None:
    owner, token = signed_in("owner")
    target = user_id(owner, "salma")
    victim = csrf_client()
    for _ in range(3):
        login(victim, "salma", "wrong")
    assert login(victim, "salma", PASSWORD).status_code == 429  # locked
    response = post(owner, token, f"/api/v1/users/{target}/reset-password/", {"password": NEW})
    assert response.status_code == 200
    assert can_sign_in("salma", NEW)


def test_patch_password_is_audited_too(world: World) -> None:
    owner, token = signed_in("owner")
    target = user_id(owner, "salma")
    response = owner.patch(
        f"/api/v1/users/{target}/", {"password": NEW}, format="json", HTTP_X_CSRFTOKEN=token
    )
    assert response.status_code == 200
    with org_context(world.org.id):
        assert AuditEvent.objects.filter(action="password_reset").count() == 1
