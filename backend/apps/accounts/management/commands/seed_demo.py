"""Sample data from the design files, for development and end-to-end tests only.

Everything it creates is labelled as sample data. Idempotent.
"""

from __future__ import annotations

import datetime as dt
import os
from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Role, User
from apps.accounts.services.users import create_user, ensure_default_roles
from apps.catalog.models import Category, Item, PriceList
from apps.catalog.services.items import UnitSpec, create_item, ensure_default_price_lists, set_price
from apps.purchasing.models import GoodsReceipt, Supplier
from apps.purchasing.services.receiving import LineInput, post_receipt, save_draft
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
    ("hasan", "حسن", "Hasan", "courier", "KRT"),
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
                self._purchasing(Branch.objects.get(code="KRT"))
                self._customers()
                self._storefront()
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

    def _customers(self) -> None:
        from apps.finance.models import Customer
        from apps.finance.services.ledger import charge_customer

        if Customer.objects.filter(code="AMAL").exists():
            return
        amal = Customer.objects.create(
            code="AMAL",
            name_ar="مركز الأمل الطبي (تجريبي)",
            name_en="Al-Amal Clinic (sample)",
            phone="09x xxx 0101",
            credit_limit=Decimal("150000"),
        )
        charge_customer(
            amal, Decimal("84000"), document_type="opening_balance", document_id=amal.pk
        )
        Customer.objects.create(
            code="NOUR",
            name_ar="عيادة النور",
            name_en="Al-Nour Clinic",
            credit_limit=Decimal("50000"),
        )

    def _purchasing(self, branch: Branch) -> None:
        """Two sample suppliers, one posted receipt (stock on hand) and one draft (the design's)."""
        nada, _ = Supplier.objects.get_or_create(
            code="NADA",
            defaults={
                "name_ar": "شركة الندى للأدوية (تجريبي)",
                "name_en": "Al-Nada Pharma (sample)",
                "payment_terms_days": 30,
            },
        )
        Supplier.objects.get_or_create(
            code="SHIFA",
            defaults={"name_ar": "مستودع الشفاء (تجريبي)", "name_en": "Al-Shifa Store (sample)"},
        )
        owner = User.objects.get(username="admin")

        def line(
            code: str,
            unit: str,
            qty: int,
            bonus: int,
            cost: str,
            batch: str,
            expiry: dt.date | None,
        ) -> LineInput:
            item = Item.objects.get(code=code)
            return LineInput(
                item.pk,
                item.units.get(code=unit).pk,
                qty,
                bonus,
                Decimal(cost),
                Decimal(0),
                batch,
                expiry,
            )

        if not GoodsReceipt.objects.filter(supplier=nada, supplier_invoice_no="INV-20398").exists():
            stock = save_draft(
                receipt=None,
                branch=branch,
                supplier=nada,
                supplier_invoice_no="INV-20398",
                invoice_date=dt.date(2026, 10, 1),
                payment_terms_days=30,
                notes="",
                lines=[
                    line("AUG-625", "box", 30, 4, "9800", "B-2301", dt.date(2026, 12, 2)),
                    line("AUG-625", "box", 20, 0, "9800", "B-2310", dt.date(2027, 3, 31)),
                    line("PAR-500", "strip", 200, 10, "600", "B-9120", dt.date(2027, 1, 15)),
                    line("OME-20", "strip", 18, 0, "1800", "B-4401", dt.date(2026, 12, 2)),
                    line("ORS-1", "sachet", 96, 0, "200", "B-7001", dt.date(2027, 9, 10)),
                    line("CSY-100", "bottle", 7, 0, "2100", "B-3301", dt.date(2027, 9, 30)),
                    line("VTC-1000", "box", 10, 0, "3800", "B-5501", dt.date(2027, 6, 30)),
                    line("AMX-500", "box", 12, 0, "3000", "B-6601", dt.date(2027, 5, 31)),
                ],
                user=owner,
            )
            post_receipt(stock.pk, idempotency_key=f"seed-{stock.pk}", user=owner)
        if not GoodsReceipt.objects.filter(supplier=nada, supplier_invoice_no="INV-20431").exists():
            save_draft(
                receipt=None,
                branch=branch,
                supplier=nada,
                supplier_invoice_no="INV-20431",
                invoice_date=dt.date(2026, 10, 21),
                payment_terms_days=30,
                notes="",
                lines=[
                    line("AUG-625", "box", 40, 4, "9800", "B-2330", dt.date(2027, 11, 30)),
                    line("PAR-500", "strip", 200, 0, "600", "B-9121", dt.date(2027, 8, 1)),
                    line("OME-20", "strip", 60, 6, "1800", "B-4407", None),
                ],
                user=owner,
            )

    def _storefront(self) -> None:
        """The design's sample storefront. Sample listings are published without images to
        show the 'no image' state; real publishing goes through update_listing, which
        requires an image (BACKLOG #60)."""
        from apps.storefront.models import Listing
        from apps.storefront.services.listings import listing_for, storefront_settings

        store = storefront_settings()
        if not store.name_ar:
            store.enabled = True
            store.branch = Branch.objects.get(code="KRT")
            store.name_ar = "صيدلية الشفاء"
            store.name_en = "Al-Shifa Pharmacy"
            store.hero_title_ar = "دواؤك قريب، وصيدلي يراجع طلبك."
            store.hero_title_en = "Your medicine is close, and a pharmacist reviews your order."
            store.hero_lead_ar = (
                "تصفّح ما تعرضه الصيدلية، أرسل طلب مراجعة، وتؤكده معك على واتساب. "
                "تستلم من الصيدلية وتدفع عند الاستلام."
            )
            store.hero_lead_en = (
                "Browse what the pharmacy offers, send a review request, and confirm it "
                "together on WhatsApp. Pick up at the pharmacy and pay on pickup."
            )
            store.address_ar = "أم درمان — شارع الأربعين"
            store.address_en = "Omdurman — Al-Arbaeen St"
            store.hours = "08:00 \u2013 22:00"  # en dash, as in the design
            store.whatsapp = "249902929451"
            store.about_ar = (
                "نص تعريفي تجريبي. تضع الصيدلية هنا قصتها وفريقها بموافقتهم، "
                "وما يميّز خدمتها. لا شهادات ولا أرقام عملاء."
            )
            store.about_en = (
                "Sample introduction. The pharmacy tells its story here, introduces its team "
                "(with their consent) and what sets its service apart."
            )
            store.save()
        for code, ar, en in STOREFRONT:
            item = Item.objects.get(code=code)
            listing = listing_for(item)
            if not listing.published:
                Listing.objects.filter(pk=listing.pk).update(
                    published=True, description_ar=ar, description_en=en
                )


# Items the sample storefront publishes, with the design's descriptions.
STOREFRONT = [
    (
        "PAR-500",
        "يخفف الألم ويخفض الحرارة. اقرأ النشرة الداخلية قبل الاستعمال.",
        "Relieves pain and lowers fever. Read the leaflet before use.",
    ),
    (
        "OME-20",
        "لخفض حموضة المعدة. يُستعمل حسب إرشاد الصيدلي أو الطبيب.",
        "Reduces stomach acid. Use as advised by a pharmacist or doctor.",
    ),
    (
        "ORS-1",
        "لتعويض السوائل والأملاح عند الإسهال. يُذاب في الماء النظيف.",
        "Replaces fluids and salts during diarrhoea. Dissolve in clean water.",
    ),
    (
        "VTC-1000",
        "مكمّل غذائي. لا يغني عن نظام غذائي متوازن.",
        "Dietary supplement. Not a substitute for a balanced diet.",
    ),
    (
        "AMX-500",
        "مضاد حيوي لا يُصرف إلا بوصفة. يراجعها الصيدلي قبل التأكيد.",
        "Antibiotic dispensed only with a prescription, reviewed by a pharmacist.",
    ),
    (
        "CSY-100",
        "للسعال عند الأطفال حسب العمر المكتوب على العبوة.",
        "For children's cough, by the age printed on the pack.",
    ),
    ("BPM-1", "جهاز رقمي للذراع. يأتي مع كفّ وبطاريات.", "Digital upper-arm monitor."),
    ("BND-20", "ضمادات للجروح الصغيرة.", "Bandages for small cuts."),
]
