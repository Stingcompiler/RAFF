"""Delete bank-transfer receipt photos of orders closed longer ago than the retention period."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from apps.orders.services import receipts
from apps.tenancy.context import org_context, resolve_org_id


class Command(BaseCommand):
    help = "Delete receipt photos of orders closed more than RAFF_RECEIPT_RETENTION_DAYS ago."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--days", type=int, default=None)

    def handle(self, *args: Any, **options: Any) -> None:
        org_id = resolve_org_id()
        if org_id is None:
            self.stdout.write("no organization")
            return
        with org_context(org_id):
            count = receipts.purge_old(options["days"])
        self.stdout.write(f"purged {count}")
