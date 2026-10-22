from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.tenancy.context import org_context, resolve_org_id
from apps.tenancy.models import Branch


class Command(BaseCommand):
    help = "Create a branch in the SINGLE_ORG_ID organization (idempotent by code)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--code", required=True)
        parser.add_argument("--name-ar", required=True)
        parser.add_argument("--name-en", required=True)
        parser.add_argument("--city-ar", default="")
        parser.add_argument("--city-en", default="")
        parser.add_argument("--receipt-locale", default="ar", choices=["ar", "en"])

    def handle(self, *args: Any, **options: Any) -> None:
        org_id = resolve_org_id()
        if org_id is None:
            raise CommandError("SINGLE_ORG_ID is not set")
        with org_context(org_id):
            branch, created = Branch.objects.get_or_create(
                code=options["code"].upper(),
                defaults={
                    "name_ar": options["name_ar"],
                    "name_en": options["name_en"],
                    "city_ar": options["city_ar"],
                    "city_en": options["city_en"],
                    "receipt_locale": options["receipt_locale"],
                },
            )
        self.stdout.write(f"{branch.pk} {'created' if created else 'exists'}")
