from __future__ import annotations

import uuid
from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from apps.tenancy.services.organizations import create_organization


class Command(BaseCommand):
    help = "Create the organization this deployment serves; prints the id for SINGLE_ORG_ID."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--name", required=True)
        parser.add_argument("--id", type=uuid.UUID, default=None)

    def handle(self, *args: Any, **options: Any) -> None:
        org = create_organization(options["name"], options["id"])
        self.stdout.write(str(org.id))
