from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from django.db import connection, models
from django.http import HttpRequest, HttpResponse
from django.test import override_settings
from django.test.utils import isolate_apps

from apps.tenancy.context import (
    OrgContextMissing,
    get_current_org_id,
    org_context,
    peek_current_org_id,
)
from apps.tenancy.middleware import OrgContextMiddleware
from apps.tenancy.models import Organization, OrgScopedModel

BACKEND_ROOT = Path(__file__).resolve().parents[3]
FORBIDDEN_CALL = "Organization.objects." + "first("


def test_middleware_binds_single_org_id_for_the_request() -> None:
    org_id = uuid.uuid4()
    seen: list[uuid.UUID | None] = []

    def view(request: HttpRequest) -> HttpResponse:
        seen.append(peek_current_org_id())
        return HttpResponse()

    with override_settings(SINGLE_ORG_ID=str(org_id)):
        OrgContextMiddleware(view)(HttpRequest())

    assert seen == [org_id]
    assert peek_current_org_id() is None


def test_no_context_raises() -> None:
    with pytest.raises(OrgContextMissing):
        get_current_org_id()


@pytest.fixture
def scoped_model(transactional_db: None) -> Iterator[type[OrgScopedModel]]:
    with isolate_apps("apps.tenancy"):

        class Note(OrgScopedModel):
            text = models.CharField(max_length=50)

            class Meta:
                app_label = "tenancy"

        with connection.schema_editor() as editor:
            editor.create_model(Note)
        yield Note
        with connection.schema_editor() as editor:
            editor.delete_model(Note)


def test_reads_are_scoped_and_writes_take_org_from_context(
    scoped_model: type[OrgScopedModel],
) -> None:
    org_a = Organization.objects.create(name="A")
    org_b = Organization.objects.create(name="B")

    with org_context(org_a.id):
        scoped_model.objects.create(text="a-note")
    with org_context(org_b.id):
        scoped_model.objects.create(text="b-note")
        assert list(scoped_model.objects.values_list("text", flat=True)) == ["b-note"]
        with pytest.raises(ValueError):
            scoped_model.objects.create(text="x", organization=org_a)

    with org_context(org_a.id):
        row = scoped_model.objects.get()
        assert row.organization_id == org_a.id

    with pytest.raises(OrgContextMissing):
        list(scoped_model.objects.all())


def test_no_code_reaches_for_first_organization() -> None:
    offenders = [
        str(path.relative_to(BACKEND_ROOT))
        for path in (BACKEND_ROOT / "apps").rglob("*.py")
        if FORBIDDEN_CALL in path.read_text(encoding="utf-8")
    ]
    assert offenders == []
