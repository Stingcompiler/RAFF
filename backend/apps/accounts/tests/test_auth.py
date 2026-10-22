from __future__ import annotations

from django.conf import settings
from rest_framework.test import APIClient

from apps.tenancy.context import org_context
from apps.tenancy.models import Branch
from apps.tenancy.services.devices import register_device
from tests.factories import PASSWORD, World


def csrf_client() -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    client.get("/api/v1/auth/csrf/")
    return client


def login(client: APIClient, username: str, password: str = PASSWORD):  # type: ignore[no-untyped-def]
    return client.post(
        "/api/v1/auth/login/",
        {"username": username, "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )


def test_csrf_cookie_is_issued(world: World) -> None:
    client = APIClient()
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 204
    assert "csrftoken" in response.cookies


def test_login_without_csrf_token_is_rejected(world: World) -> None:
    client = csrf_client()
    response = client.post(
        "/api/v1/auth/login/", {"username": "salma", "password": PASSWORD}, format="json"
    )
    assert response.status_code == 403


def test_login_with_csrf_returns_profile(world: World) -> None:
    client = csrf_client()
    response = login(client, "Salma")  # usernames are case-insensitive
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["username"] == "salma"
    assert [b["code"] for b in body["branches"]] == ["KRT"]
    assert "pos.sell" in body["permissions"]
    cookie = response.cookies[settings.SESSION_COOKIE_NAME]
    assert cookie["httponly"] and cookie["samesite"] == "Lax"


def test_wrong_password_gives_generic_error(world: World) -> None:
    client = csrf_client()
    for username in ("salma", "nobody"):
        response = login(client, username, "wrong-password")
        assert response.status_code == 400
        assert response.json() == {"detail": "invalid_credentials"}


def test_inactive_user_cannot_sign_in(world: World) -> None:
    with org_context(world.org.id):
        world.cashier.is_active = False
        world.cashier.save()
    assert login(csrf_client(), "salma").status_code == 400


def test_logout_requires_csrf_and_invalidates_the_session(world: World) -> None:
    client = csrf_client()
    login(client, "salma")
    session_cookie = client.cookies[settings.SESSION_COOKIE_NAME].value
    assert client.get("/api/v1/auth/me/").status_code == 200

    assert client.post("/api/v1/auth/logout/").status_code == 403  # no CSRF header
    response = client.post(
        "/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value
    )
    assert response.status_code == 204

    replay = APIClient()
    replay.cookies[settings.SESSION_COOKIE_NAME] = session_cookie
    assert replay.get("/api/v1/auth/me/").status_code == 403


def test_choose_branch_and_counter(world: World) -> None:
    client = csrf_client()
    login(client, "salma")
    token = client.cookies["csrftoken"].value
    ok = client.post(
        "/api/v1/auth/context/",
        {"branch_id": str(world.khartoum.pk), "device_id": str(world.counter.pk)},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert ok.status_code == 200
    assert ok.json()["branch"]["code"] == "KRT"
    assert ok.json()["device"]["name_en"] == "Counter 1"

    denied = client.post(
        "/api/v1/auth/context/",
        {"branch_id": str(world.omdurman.pk)},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert denied.status_code == 403


def test_registered_counter_is_reported_and_preselected(world: World) -> None:
    with org_context(world.org.id):
        token = register_device(world.counter)
    client = csrf_client()
    client.cookies[settings.DEVICE_COOKIE_NAME] = token
    info = client.get("/api/v1/auth/device/").json()
    assert info["registered"] is True
    assert info["device"]["name_ar"] == "كاونتر 1"
    assert info["branch"]["code"] == "KRT"
    me = login(client, "salma").json()
    assert me["device"]["id"] == str(world.counter.pk)


def test_unknown_device_token_is_not_registered(world: World) -> None:
    client = APIClient()
    client.cookies[settings.DEVICE_COOKIE_NAME] = "forged"
    assert client.get("/api/v1/auth/device/").json() == {
        "registered": False,
        "device": None,
        "branch": None,
    }


def test_other_organization_object_is_404(world: World, other_org_branch: Branch) -> None:
    client = csrf_client()
    login(client, "owner")
    assert client.get(f"/api/v1/branches/{world.khartoum.pk}/").status_code == 200
    assert client.get(f"/api/v1/branches/{other_org_branch.pk}/").status_code == 404
    listed = [b["id"] for b in client.get("/api/v1/branches/").json()]
    assert str(other_org_branch.pk) not in listed


def test_cannot_choose_branch_of_other_organization(world: World, other_org_branch: Branch) -> None:
    client = csrf_client()
    login(client, "owner")
    response = client.post(
        "/api/v1/auth/context/",
        {"branch_id": str(other_org_branch.pk)},
        format="json",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    assert response.status_code == 403


def test_anonymous_requests_are_refused(world: World) -> None:
    client = APIClient()
    for url in ("/api/v1/auth/me/", "/api/v1/branches/", "/api/v1/users/"):
        assert client.get(url).status_code == 403
