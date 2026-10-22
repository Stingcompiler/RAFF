"""Sample data from the design files, for development and end-to-end tests only.

Everything it creates is labelled as sample data. Idempotent.
"""

from __future__ import annotations

import os
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Role, User
from apps.accounts.services.users import create_user, ensure_default_roles
from apps.tenancy.context import org_context, resolve_org_id
from apps.tenancy.models import Branch, Device, Organization

BRANCHES = [
    ("KRT", "فرع الخرطوم (تجريبي)", "Khartoum branch (sample)", "الخرطوم", "Khartoum"),
    ("OMD", "فرع أم درمان (تجريبي)", "Omdurman branch (sample)", "أم درمان", "Omdurman"),
]
DEVICES = [
    ("KRT", "كاونتر 1", "Counter 1"),
    ("KRT", "كاونتر 2", "Counter 2"),
    ("OMD", "كاونتر 1", "Counter 1"),
]
# username, Arabic name, English name, role code, branch code (None = all branches)
USERS = [
    ("admin", "المالك", "Owner", "owner", None),
    ("mazin", "مازن", "Mazin", "pharmacist", "KRT"),
    ("salma", "سلمى", "Salma", "cashier", "KRT"),
    ("huda", "هدى", "Huda", "accountant", None),
]


class Command(BaseCommand):
    help = "Load the design's sample organization, branches, counters and users (dev/test only)."

    def handle(self, *args: Any, **options: Any) -> None:
        org_id = resolve_org_id()
        password = os.environ.get("RAFF_DEMO_PASSWORD")
        if org_id is None or not password:
            raise CommandError("Set SINGLE_ORG_ID and RAFF_DEMO_PASSWORD")
        with transaction.atomic():
            Organization.objects.get_or_create(id=org_id, defaults={"name": "صيدلية تجريبية"})
            with org_context(org_id):
                ensure_default_roles()
                branches = {}
                for code, name_ar, name_en, city_ar, city_en in BRANCHES:
                    branches[code], _ = Branch.objects.get_or_create(
                        code=code,
                        defaults={
                            "name_ar": name_ar,
                            "name_en": name_en,
                            "city_ar": city_ar,
                            "city_en": city_en,
                        },
                    )
                for code, name_ar, name_en in DEVICES:
                    Device.objects.get_or_create(
                        branch=branches[code], name_en=name_en, defaults={"name_ar": name_ar}
                    )
                for username, name_ar, name_en, role, branch in USERS:
                    existing = User.objects.filter(username=username).first()
                    if existing is not None:
                        # Demo accounts always take the current demo password.
                        existing.set_password(password)
                        existing.is_active = True
                        existing.save(update_fields=["password", "is_active"])
                        continue
                    create_user(
                        username=username,
                        password=password,
                        display_name_ar=name_ar,
                        display_name_en=name_en,
                        assignments=[
                            (
                                Role.objects.get(code=role).pk,
                                branches[branch].pk if branch else None,
                            )
                        ],
                    )
        self.stdout.write("sample data ready")
