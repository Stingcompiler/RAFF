# Views authorize and delegate to services/.
from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import requires
from apps.backup.models import BackupRun
from apps.backup.serializers import BackupStatusSerializer


def _run(run: BackupRun | None) -> dict[str, Any] | None:
    if run is None:
        return None
    return {
        "at": run.created_at,
        "file": run.file,
        "size_bytes": run.size_bytes,
        "offsite": run.offsite,
        "detail": run.detail,
    }


class BackupStatusView(APIView):
    """Last good backup, last failure and last restore drill (Settings tiles)."""

    permission_classes = [requires("settings.manage")]

    @extend_schema(operation_id="backup_status", responses=BackupStatusSerializer)
    def get(self, request: Request) -> Response:
        backups = BackupRun.objects.filter(kind=BackupRun.Kind.BACKUP)
        ok = backups.filter(status=BackupRun.Status.OK).first()
        failed = backups.filter(status=BackupRun.Status.FAILED).first()
        drill = BackupRun.objects.filter(
            kind=BackupRun.Kind.RESTORE_TEST, status=BackupRun.Status.OK
        ).first()
        # The off-site copy is judged on its own (review D-03): a good local backup does not
        # hide days without a copy away from this server.
        off_ok = backups.filter(status=BackupRun.Status.OK, offsite=True).first()
        off_failed = BackupRun.objects.filter(
            kind=BackupRun.Kind.OFFSITE, status=BackupRun.Status.FAILED
        ).first()
        return Response(
            BackupStatusSerializer(
                {
                    "last_ok": _run(ok),
                    "last_failed": _run(failed),
                    "last_restore_test": _run(drill),
                    "failing": bool(failed and (ok is None or failed.created_at > ok.created_at)),
                    "last_offsite_ok": _run(off_ok),
                    "last_offsite_failed": _run(off_failed),
                    "offsite_failing": bool(
                        off_failed and (off_ok is None or off_failed.created_at > off_ok.created_at)
                    ),
                }
            ).data
        )
