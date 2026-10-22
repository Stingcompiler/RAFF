from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command
from django.test import override_settings

from apps.returns.tests.test_api import owner_at
from apps.sales.tests.test_api import cashier
from tests.factories import World

pytestmark = pytest.mark.django_db


def test_backup_runs_feed_the_settings_tiles(world: World) -> None:
    with override_settings(SINGLE_ORG_ID=str(world.org.id)):
        call_command(
            "record_backup", "ok", "--file", "raff-1.tar.enc", "--bytes", "2048", stdout=StringIO()
        )
        call_command("record_backup", "failed", "--detail", "disk full", stdout=StringIO())
        call_command("record_backup", "ok", "--kind", "restore_test", stdout=StringIO())
    client, _ = owner_at(world, world.khartoum.pk)
    status = client.get("/api/v1/backup/status/").json()
    assert status["last_ok"]["file"] == "raff-1.tar.enc" and status["last_ok"]["size_bytes"] == 2048
    assert status["failing"] is True and status["last_failed"]["detail"] == "disk full"
    assert status["last_restore_test"] is not None
    teller, _ = cashier(world)
    assert teller.get("/api/v1/backup/status/").status_code == 403


def test_create_branch_is_idempotent(world: World) -> None:
    with override_settings(SINGLE_ORG_ID=str(world.org.id)):
        out = StringIO()
        args = ["--code", "bhr", "--name-ar", "فرع بحري", "--name-en", "Bahri"]
        call_command("create_branch", *args, stdout=out)
        call_command("create_branch", *args, stdout=out)
    lines = out.getvalue().split("\n")
    assert lines[0].endswith("created") and lines[1].endswith("exists")
