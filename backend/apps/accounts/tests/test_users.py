from __future__ import annotations

from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.tenancy.context import org_context
from tests.factories import World

from .test_auth import csrf_client, login


def signed_in(username: str, password: str | None = None) -> tuple[APIClient, str]:
    client = csrf_client()
    login(client, username, *([password] if password else []))
    return client, client.cookies["csrftoken"].value


def test_cashier_cannot_manage_users(world: World) -> None:
    client, _ = signed_in("salma")
    assert client.get("/api/v1/users/").status_code == 403


def test_owner_creates_user_with_branch_role(world: World) -> None:
    client, token = signed_in("owner")
    with org_context(world.org.id):
        pharmacist = Role.objects.get(code="pharmacist")
    response = client.post(
        "/api/v1/users/",
        {
            "username": "mazin",
            "password": "pharmacy-pass-77",
            "display_name_ar": "مازن",
            "display_name_en": "Mazin",
            "assignments": [{"role_id": str(pharmacist.pk), "branch_id": str(world.khartoum.pk)}],
        },
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 201, response.json()
    assert response.json()["roles"][0]["role_code"] == "pharmacist"

    duplicate = client.post(
        "/api/v1/users/",
        {
            "username": "MAZIN",
            "password": "pharmacy-pass-77",
            "display_name_ar": "م",
            "display_name_en": "M",
            "assignments": [],
        },
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert duplicate.json() == {"detail": "username_taken"}

    mazin, _ = signed_in("mazin", "pharmacy-pass-77")
    assert mazin.get("/api/v1/auth/me/").json()["user"]["display_name_en"] == "Mazin"


def test_weak_password_is_rejected(world: World) -> None:
    client, token = signed_in("owner")
    response = client.post(
        "/api/v1/users/",
        {
            "username": "x1x",
            "password": "password",
            "display_name_ar": "x",
            "display_name_en": "x",
            "assignments": [],
        },
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 400


def test_deactivate_user_and_not_yourself(world: World) -> None:
    client, token = signed_in("owner")
    off = client.patch(
        f"/api/v1/users/{world.cashier.pk}/",
        {"is_active": False},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert off.json()["is_active"] is False
    self_off = client.patch(
        f"/api/v1/users/{world.owner.pk}/",
        {"is_active": False},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert self_off.json() == {"detail": "cannot_deactivate_self"}
