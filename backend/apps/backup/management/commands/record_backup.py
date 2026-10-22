from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.audit.services.log import record
from apps.backup.models import BackupRun
from apps.tenancy.context import org_context, resolve_org_id


class Command(BaseCommand):
    help = "Record a backup or restore-test result (called by infra/backup scripts)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("status", choices=[c for c, _ in BackupRun.Status.choices])
        parser.add_argument(
            "--kind", default="backup", choices=[c for c, _ in BackupRun.Kind.choices]
        )
        parser.add_argument("--file", default="")
        parser.add_argument("--bytes", type=int, default=0)
        parser.add_argument("--offsite", action="store_true")
        parser.add_argument("--detail", default="")

    def handle(self, *args: Any, **options: Any) -> None:
        org_id = resolve_org_id()
        if org_id is None:
            raise CommandError("SINGLE_ORG_ID is not set")
        with org_context(org_id):
            run = BackupRun.objects.create(
                kind=options["kind"],
                status=options["status"],
                file=options["file"][:200],
                size_bytes=options["bytes"],
                offsite=options["offsite"],
                detail=options["detail"][:300],
            )
            record(f"{run.kind}_{run.status}", "backup", run.pk, actor=None, file=run.file)
        self.stdout.write(str(run.pk))
