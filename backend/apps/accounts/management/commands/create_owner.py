from __future__ import annotations

import os
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.accounts.models import Role
from apps.accounts.services.users import create_user
from apps.tenancy.context import org_context, resolve_org_id


class Command(BaseCommand):
    help = "Create an owner in the SINGLE_ORG_ID organization (password: RAFF_OWNER_PASSWORD)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--username", required=True)
        parser.add_argument("--name-ar", required=True)
        parser.add_argument("--name-en", required=True)

    def handle(self, *args: Any, **options: Any) -> None:
        org_id = resolve_org_id()
        password = os.environ.get("RAFF_OWNER_PASSWORD")
        if org_id is None or not password:
            raise CommandError("Set SINGLE_ORG_ID and RAFF_OWNER_PASSWORD")
        with org_context(org_id):
            owner = Role.objects.get(code="owner")
            user = create_user(
                username=options["username"],
                password=password,
                display_name_ar=options["name_ar"],
                display_name_en=options["name_en"],
                assignments=[(owner.pk, None)],
            )
        self.stdout.write(str(user.pk))
