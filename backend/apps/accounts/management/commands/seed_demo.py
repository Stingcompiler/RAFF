"""Sample data from the design files, for development and end-to-end tests only.

Everything it creates is labelled as sample data. Idempotent.
"""

from __future__ import annotations

import os
from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Role, User
from apps.accounts.services.users import create_user, ensure_default_roles
from apps.catalog.models import Category, Item, PriceList
from apps.catalog.services.items import UnitSpec, create_item, ensure_default_price_lists, set_price
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


CATEGORIES = [
    ("antibiotics", "مضادات حيوية", "Antibiotics"),
    ("analgesics", "مسكنات", "Analgesics"),
    ("gastro", "الجهاز الهضمي", "Gastro"),
    ("respiratory", "الجهاز التنفسي", "Respiratory"),
    ("vitamins", "فيتامينات", "Vitamins"),
    ("rehydration", "محاليل", "Rehydration"),
    ("devices", "أجهزة", "Devices"),
    ("supplies", "مستلزمات", "Supplies"),
]
TAB = ("tab", "قرص", "Tablet")
CAP = ("cap", "كبسولة", "Capsule")
# code, name_ar, name_en, generic, strength, form, category, rx, base unit,
# packs [(code, ar, en, factor, barcode)], retail price of the sale (largest) unit
ITEMS = [
    (
        "AUG-625",
        "أموكسيسيلين/كلافولانيك",
        "Augmentin",
        "amoxicillin/clavulanic",
        "625 mg",
        "tab",
        "antibiotics",
        True,
        TAB,
        [
            ("strip", "شريط", "Strip", 7, "6221234567891"),
            ("box", "علبة", "Box", 14, "6221234567890"),
        ],
        "12500",
    ),
    (
        "PAR-500",
        "باراسيتامول",
        "Paracetamol",
        "paracetamol",
        "500 mg",
        "tab",
        "analgesics",
        False,
        TAB,
        [("strip", "شريط", "Strip", 10, "6221234500017")],
        "800",
    ),
    (
        "OME-20",
        "أوميبرازول",
        "Omeprazole",
        "omeprazole",
        "20 mg",
        "cap",
        "gastro",
        False,
        CAP,
        [("strip", "شريط", "Strip", 14, "6221234500024")],
        "2400",
    ),
    (
        "IBU-400",
        "إيبوبروفين",
        "Ibuprofen",
        "ibuprofen",
        "400 mg",
        "tab",
        "analgesics",
        False,
        TAB,
        [("strip", "شريط", "Strip", 10, "6221234500031")],
        "1100",
    ),
    (
        "ORS-1",
        "محلول الإرواء الفموي",
        "ORS sachet",
        "oral rehydration salts",
        "1 sachet",
        "",
        "rehydration",
        False,
        ("sachet", "كيس", "Sachet"),
        [],
        "300",
    ),
    (
        "CSY-100",
        "شراب سعال",
        "Cough syrup",
        "dextromethorphan",
        "100 ml",
        "syr",
        "respiratory",
        False,
        ("bottle", "زجاجة", "Bottle"),
        [],
        "2900",
    ),
    (
        "VTC-1000",
        "فيتامين C",
        "Vitamin C",
        "ascorbic acid",
        "1000 mg",
        "eff",
        "vitamins",
        False,
        ("tab", "قرص فوار", "Effervescent tablet"),
        [("box", "علبة", "Box", 20, "6221234500048")],
        "4500",
    ),
    (
        "AMX-500",
        "أموكسيسيلين",
        "Amoxicillin",
        "amoxicillin",
        "500 mg",
        "cap",
        "antibiotics",
        True,
        CAP,
        [("box", "علبة", "Box", 16, "6221234500055")],
        "3600",
    ),
    (
        "BPM-1",
        "جهاز قياس الضغط",
        "Blood pressure monitor",
        "",
        "digital",
        "",
        "devices",
        False,
        ("piece", "جهاز", "Device"),
        [],
        "45000",
    ),
    (
        "BND-20",
        "ضمادات لاصقة",
        "Adhesive bandages",
        "",
        "20 pcs",
        "",
        "supplies",
        False,
        ("piece", "قطعة", "Piece"),
        [("box", "علبة", "Box", 20, "6221234500062")],
        "1500",
    ),
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
            with org_context(org_id):
                self._catalog()
        self.stdout.write("sample data ready")

    def _catalog(self) -> None:
        ensure_default_price_lists()
        wholesale = PriceList.objects.get(code="wholesale")
        cats = {}
        for code, name_ar, name_en in CATEGORIES:
            cats[code], _ = Category.objects.get_or_create(
                code=code, defaults={"name_ar": name_ar, "name_en": name_en}
            )
        for code, name_ar, name_en, generic, strength, form, cat, rx, base, packs, price in ITEMS:
            if Item.objects.filter(code=code).exists():
                continue
            units = [
                UnitSpec(base[0], base[1], base[2], 1, is_base=True, is_default_sale=not packs)
            ]
            units += [
                UnitSpec(c, ar, en, factor, is_default_sale=i == len(packs) - 1, barcodes=[bc])
                for i, (c, ar, en, factor, bc) in enumerate(packs)
            ]
            item = create_item(
                code=code,
                name_ar=name_ar,
                name_en=name_en,
                generic_name=generic,
                strength=strength,
                dosage_form=form,
                category=cats[cat],
                classification=Item.Classification.RX if rx else Item.Classification.OTC,
                reorder_level_base=20,
                units=units,
            )
            sale = item.units.get(is_default_sale=True)
            set_price(sale, Decimal(price))
            set_price(sale, Decimal(price) * Decimal("0.9"), price_list=wholesale)
