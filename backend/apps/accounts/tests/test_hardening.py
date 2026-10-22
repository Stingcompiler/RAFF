from __future__ import annotations

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.tenancy.context import org_context
from tests.factories import PASSWORD, World

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    cache.clear()


def login(client: APIClient, password: str) -> int:
    return client.post(
        "/api/v1/auth/login/", {"username": "owner", "password": password}, format="json"
    ).status_code


@override_settings(RAFF_LOGIN_MAX_FAILURES=3)
def test_repeated_wrong_passwords_lock_the_username(world: World) -> None:
    client = APIClient()
    assert [login(client, "wrong") for _ in range(2)] == [400, 400]
    assert login(client, "wrong") == 429
    # Locked: even the right password is refused until the lock expires.
    assert login(client, PASSWORD) == 429
    with org_context(world.org.id):
        assert AuditEvent.objects.filter(action="locked", object_type="login").count() == 1
    cache.clear()
    assert login(client, PASSWORD) == 200


def test_a_good_sign_in_clears_earlier_failures(world: World) -> None:
    client = APIClient()
    for _ in range(4):
        assert login(client, "wrong") == 400
    assert login(client, PASSWORD) == 200
    client.post("/api/v1/auth/logout/")
    assert login(APIClient(), "wrong") == 400  # the count started again


def test_every_response_carries_a_request_id() -> None:
    client = APIClient()
    own = client.get("/api/v1/health/", HTTP_X_REQUEST_ID="abc-12345678")
    assert own["X-Request-ID"] == "abc-12345678"
    fresh = client.get("/api/v1/health/", HTTP_X_REQUEST_ID="bad id!")
    assert len(fresh["X-Request-ID"]) == 12 and fresh["X-Request-ID"] != "bad id!"
