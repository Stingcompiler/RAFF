from __future__ import annotations

import uuid
from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.accounts.tests.test_auth import csrf_client
from apps.notifications.models import Notification
from apps.orders.models import Inquiry
from apps.returns.tests.test_api import owner_at
from apps.tenancy.context import org_context
from tests.factories import World

pytestmark = pytest.mark.django_db

URL = "/api/v1/public/inquiries/"


def guest() -> tuple[APIClient, dict[str, Any]]:
    client = csrf_client()
    return client, {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}


def body(**over: Any) -> dict[str, Any]:
    return {
        "name": "سلمى أحمد",
        "phone": "0912345678",
        "topic": "medicine",
        "via": "whatsapp",
        "order_number": "",
        "message": "هل يتوفر باراسيتامول للأطفال؟",
        "locale": "ar",
        "agree": True,
        **over,
    }


def test_visitor_question_is_stored_once_and_staff_are_told(world: World) -> None:
    client, csrf = guest()
    key = str(uuid.uuid4())
    first = client.post(URL, body(), format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf)
    assert first.status_code == 201, first.json()
    assert first.json()["number"].startswith("Q-")
    again = client.post(URL, body(), format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf)
    assert again.json() == first.json()
    changed = client.post(
        URL, body(message="سؤال آخر"), format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf
    )
    assert changed.status_code == 409
    with org_context(world.org.id):
        assert Inquiry.objects.count() == 1
        row = Inquiry.objects.get()
        assert (row.phone, row.contact_via, row.locale) == ("0912345678", "whatsapp", "ar")
        assert Notification.objects.filter(kind="inquiry_new").count() == 1


def test_validation_and_consent(world: World) -> None:
    client, csrf = guest()

    def send(**over: Any) -> Any:
        return client.post(
            URL, body(**over), format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **csrf
        )

    assert send(phone="12345").json()["detail"] == "invalid_phone"
    assert send(name="س").json()["detail"] == "invalid_name"
    assert send(message=" ").status_code == 400
    assert send(topic="order", order_number="").json()["detail"] == "order_number_required"
    assert send(agree=False).status_code == 400
    assert send(topic="nope").status_code == 400
    no_key = client.post(URL, body(), format="json", **csrf)
    assert no_key.status_code == 400


def test_a_phone_cannot_flood_the_inbox(world: World) -> None:
    client, csrf = guest()
    codes = [
        client.post(
            URL, body(), format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **csrf
        ).status_code
        for _ in range(6)
    ]
    assert codes == [201] * 5 + [429]


def test_staff_list_and_answer(world: World) -> None:
    client, csrf = guest()
    client.post(URL, body(), format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **csrf)
    assert client.get("/api/v1/inquiries/").status_code in (401, 403)
    staff, scsrf = owner_at(world, world.khartoum.pk)
    rows = staff.get("/api/v1/inquiries/").json()
    assert len(rows) == 1 and rows[0]["unread"] is True and rows[0]["status"] == "new"
    assert staff.get("/api/v1/inquiries/?q=0912").json()[0]["id"] == rows[0]["id"]
    assert staff.get("/api/v1/inquiries/?status=closed").json() == []
    done = staff.post(
        f"/api/v1/inquiries/{rows[0]['id']}/status/",
        {"status": "answered"},
        format="json",
        **scsrf,
    )
    assert done.status_code == 200 and done.json()["status"] == "answered"
    assert done.json()["unread"] is False
    assert staff.get("/api/v1/inquiries/?status=new").json() == []
