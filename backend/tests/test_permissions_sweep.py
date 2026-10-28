"""WO-12: every API route is covered by a permission test.

The sweep walks the URL resolver, so a new route is tested the day it is added:
anonymous callers are refused everywhere except the public allowlist, and a signed-in
user whose role holds no permission is refused everywhere except the allowlist of
"any signed-in user" routes.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.accounts.services.users import create_user
from apps.tenancy.context import org_context
from tests.factories import PASSWORD, World

pytestmark = pytest.mark.django_db

# Reachable without a session (public storefront, health, sign-in plumbing).
PUBLIC = {
    "api/v1/health/",
    "api/v1/auth/csrf/",
    "api/v1/auth/login/",
    "api/v1/auth/device/",
    "api/v1/public/store/",
    "api/v1/public/categories/",
    "api/v1/public/products/",
    "api/v1/public/products/<slug:slug>/",
    "api/v1/public/inquiries/",
    "api/v1/public/orders/",
    "api/v1/public/orders/track/",
    "api/v1/public/orders/by-key/<str:key>/",
    "api/v1/public/orders/<str:token>/",
    "api/v1/public/orders/<str:token>/payment/",
    "api/v1/public/orders/<str:token>/receipt/",
}
# Any signed-in user, whatever their role.
SIGNED_IN = {
    "api/v1/auth/logout/",
    "api/v1/auth/me/",
    "api/v1/auth/context/",
    "api/v1/auth/password/change/",
    "api/v1/branches/",
    "api/v1/branches/<uuid:pk>/",
    "api/v1/licensing/status/",
}
METHODS = ("get", "post", "put", "patch", "delete")


def routes() -> list[tuple[str, Any]]:
    out: list[tuple[str, Any]] = []

    def walk(patterns: list[URLPattern | URLResolver], prefix: str) -> None:
        for p in patterns:
            if isinstance(p, URLResolver):
                walk(p.url_patterns, prefix + str(p.pattern))
            else:
                out.append((prefix + str(p.pattern), p.callback))

    walk(get_resolver().url_patterns, "")
    return [(r, cb) for r, cb in out if r.startswith("api/v1/") and "schema" not in r]


def concrete(route: str) -> str:
    sample = {"uuid": str(uuid.uuid4()), "slug": "x", "str": "x" * 40, "int": "1"}
    path = route
    while "<" in path:
        start = path.index("<")
        end = path.index(">", start)
        kind = path[start + 1 : end].split(":")[0]
        path = path[:start] + sample.get(kind, "x") + path[end + 1 :]
    return "/" + path


def handlers(callback: Any) -> list[str]:
    view = getattr(callback, "cls", None) or getattr(callback, "view_class", None)
    if view is None:  # function-based view (@api_view)
        allowed = getattr(callback, "initkwargs", {}).get("http_method_names") or ["get"]
        return [m for m in METHODS if m in allowed]
    return [m for m in METHODS if hasattr(view, m)]


def test_the_sweep_finds_the_api() -> None:
    found = {r for r, _ in routes()}
    assert len(found) > 80
    assert found >= PUBLIC | SIGNED_IN, (PUBLIC | SIGNED_IN) - found


def test_anonymous_callers_are_refused_outside_the_public_allowlist(world: World) -> None:
    client = APIClient()
    for route, callback in routes():
        if route in PUBLIC:
            continue
        for method in handlers(callback):
            res = getattr(client, method)(concrete(route), {}, format="json")
            assert res.status_code in (401, 403), f"{method.upper()} {route} → {res.status_code}"


def test_a_role_without_permissions_is_refused_everywhere_else(world: World) -> None:
    with org_context(world.org.id):
        empty = Role.objects.create(code="nothing", name_ar="بلا", name_en="None", permissions=[])
        create_user(
            username="nobody",
            password=PASSWORD,
            display_name_ar="أحد",
            display_name_en="Nobody",
            assignments=[(empty.pk, world.khartoum.pk)],
        )
    client = APIClient()
    assert (
        client.post(
            "/api/v1/auth/login/", {"username": "nobody", "password": PASSWORD}, format="json"
        ).status_code
        == 200
    )
    client.post(
        "/api/v1/auth/context/",
        {"branch_id": str(world.khartoum.pk), "device_id": str(world.counter.pk)},
        format="json",
    )
    for route, callback in routes():
        if route in PUBLIC or route in SIGNED_IN:
            continue
        for method in handlers(callback):
            res = getattr(client, method)(concrete(route), {}, format="json")
            assert res.status_code == 403, f"{method.upper()} {route} → {res.status_code}"
