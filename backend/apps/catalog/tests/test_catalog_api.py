from __future__ import annotations

import datetime as dt
import time
from decimal import Decimal
from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.accounts.tests.test_auth import csrf_client, login
from apps.catalog.models import Item, ItemPrice
from apps.catalog.services.items import CatalogError, UnitSpec, create_item, set_price
from apps.tenancy.context import org_context
from tests.factories import World


def owner(world: World) -> tuple[APIClient, dict[str, Any]]:
    client = csrf_client()
    login(client, "owner")
    return client, {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}


def strip_units(barcode: str = "") -> list[UnitSpec]:
    return [
        UnitSpec("tab", "قرص", "Tablet", 1, is_base=True),
        UnitSpec(
            "strip",
            "شريط",
            "Strip",
            10,
            is_default_sale=True,
            barcodes=[barcode] if barcode else [],
        ),
    ]


@pytest.fixture
def advance(world: World) -> Item:
    with org_context(world.org.id):
        item = create_item(
            code="ADV-500",
            name_ar="أدفانس 500",
            name_en="Advance 500",
            generic_name="Paracetamol",
            strength="500 mg",
            dosage_form="tab",
            units=strip_units("6221000000017"),
        )
        set_price(item.units.get(code="strip"), Decimal("800"))
        return item


def test_search_finds_hamza_variant(world: World, advance: Item) -> None:
    client, _ = owner(world)
    rows = client.get("/api/v1/catalog/items/", {"q": "ادفانس"}).json()["results"]
    assert [r["code"] for r in rows] == ["ADV-500"]
    assert rows[0]["price"] == "800.0000"
    assert rows[0]["sale_unit"]["name_ar"] == "شريط"


def test_search_by_generic_and_partial_and_barcode(world: World, advance: Item) -> None:
    client, _ = owner(world)
    for q in ("paracetamol", "ادف", "6221000000017", "ADV-500"):
        rows = client.get("/api/v1/catalog/items/", {"q": q}).json()["results"]
        assert [r["code"] for r in rows] == ["ADV-500"], q
    assert client.get("/api/v1/catalog/items/", {"q": "xyzq"}).json()["results"] == []


def test_barcode_lookup(world: World, advance: Item) -> None:
    client, _ = owner(world)
    found = client.get("/api/v1/catalog/barcode/", {"code": "6221000000017"})
    assert found.json()["unit"]["code"] == "strip"
    assert client.get("/api/v1/catalog/barcode/", {"code": "000"}).status_code == 404


def test_item_needs_exactly_one_base_unit(world: World) -> None:
    with org_context(world.org.id), pytest.raises(CatalogError, match="base_unit_required"):
        create_item(code="X", name_ar="x", name_en="x", units=[UnitSpec("box", "علبة", "Box", 10)])


def test_barcode_unique_within_org(world: World, advance: Item) -> None:
    with org_context(world.org.id), pytest.raises(CatalogError, match="barcode_taken"):
        create_item(code="OTHER", name_ar="ب", name_en="B", units=strip_units("6221000000017"))


def test_create_item_via_api_with_units_and_price(world: World) -> None:
    client, csrf = owner(world)
    response = client.post(
        "/api/v1/catalog/items/",
        {
            "code": "AUG-625",
            "name_ar": "أموكسيسيلين/كلافولانيك",
            "name_en": "Augmentin",
            "strength": "625 mg",
            "dosage_form": "tab",
            "classification": "rx",
            "units": [
                {
                    "code": "tab",
                    "name_ar": "قرص",
                    "name_en": "Tablet",
                    "factor": 1,
                    "is_base": True,
                },
                {"code": "strip", "name_ar": "شريط", "name_en": "Strip", "factor": 7},
                {
                    "code": "box",
                    "name_ar": "علبة",
                    "name_en": "Box",
                    "factor": 14,
                    "is_default_sale": True,
                    "barcodes": ["6221234567890"],
                },
            ],
            "price": "12500",
        },
        format="json",
        **csrf,
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["sale_unit"]["code"] == "box"
    assert body["price"] == "12500.0000"
    assert [u["factor"] for u in body["units"]] == [1, 7, 14]


def test_price_versions_are_kept(world: World, advance: Item) -> None:
    with org_context(world.org.id):
        strip = advance.units.get(code="strip")
        future = dt.date.today() + dt.timedelta(days=10)
        set_price(strip, Decimal("850"), effective_from=future)
        with pytest.raises(CatalogError, match="price_exists_for_date"):
            set_price(strip, Decimal("900"), effective_from=future)
        assert ItemPrice.objects.filter(unit=strip).count() == 2
    client, _ = owner(world)
    detail = client.get(f"/api/v1/catalog/items/{advance.pk}/").json()
    assert detail["price"] == "800.0000"  # the future price is not current yet
    assert [p["price"] for p in detail["prices"]] == ["850.0000", "800.0000"]


def test_cashier_reads_but_cannot_create(world: World, advance: Item) -> None:
    client = csrf_client()
    login(client, "salma")
    assert client.get("/api/v1/catalog/items/").status_code == 200
    created = client.post(
        "/api/v1/catalog/items/",
        {},
        format="json",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    assert created.status_code == 403


def make_csv(rows: int, start: int = 0) -> bytes:
    header = (
        "code,name_ar,name_en,generic_name,strength,dosage_form,category,classification,"
        "base_unit_ar,base_unit_en,sale_unit_ar,sale_unit_en,sale_unit_factor,barcode,price,reorder_level\n"
    )
    lines = [
        f"SKU-{i:05d},صنف تجريبي {i},Sample item {i},Generic {i % 50},{i % 900 + 5} mg,tab,"
        f"analgesics,{'rx' if i % 7 == 0 else 'otc'},قرص,Tablet,شريط,Strip,10,"
        f"62290{i:08d},{100 + i},20"
        for i in range(start, start + rows)
    ]
    return (header + "\n".join(lines) + "\n").encode()


def upload(client: APIClient, csrf: dict[str, Any], content: bytes, name: str = "items.csv"):  # type: ignore[no-untyped-def]
    from django.core.files.uploadedfile import SimpleUploadedFile

    return client.post(
        "/api/v1/catalog/imports/",
        {"file": SimpleUploadedFile(name, content, "text/csv")},
        format="multipart",
        **csrf,
    )


def test_import_3000_rows_with_matching(world: World) -> None:
    client, csrf = owner(world)
    started = time.monotonic()
    preview = upload(client, csrf, make_csv(3000))
    assert preview.status_code == 201, preview.json()
    batch = preview.json()
    assert batch["summary"] == {"create": 3000, "update": 0, "duplicate": 0, "error": 0}

    applied = client.post(f"/api/v1/catalog/imports/{batch['id']}/apply/", **csrf).json()
    assert applied["status"] == "applied"
    assert applied["summary"]["created"] == 3000
    again = client.post(f"/api/v1/catalog/imports/{batch['id']}/apply/", **csrf).json()
    assert again["summary"]["created"] == 3000  # applying twice changes nothing
    with org_context(world.org.id):
        assert Item.objects.count() == 3000
    assert time.monotonic() - started < 60

    # Re-importing the same file matches every row by code: updates, no duplicates.
    second = upload(client, csrf, make_csv(3000)).json()
    assert second["summary"] == {"create": 0, "update": 3000, "duplicate": 0, "error": 0}
    rows = client.get("/api/v1/catalog/items/", {"q": "صنف تجريبي 1234"}).json()["results"]
    assert rows[0]["code"] == "SKU-01234"
    assert rows[0]["price"] == "1334.0000"


def test_import_reports_problems_per_row(world: World, advance: Item) -> None:
    client, csrf = owner(world)
    content = make_csv(2).decode() + (
        "SKU-00000,مكرر,Repeat,,,,,,قرص,Tablet,,,,,,\n"  # code repeated in file
        "NEW-1,جديد,New,,,,,,قرص,Tablet,,,,6221000000017,,\n"  # barcode of another item
        "NEW-2,نسخة,Advance 500,,500 mg,tab,,,قرص,Tablet,,,,,,\n"  # same name/strength/form
        "NEW-3,,Missing Arabic,,,,,,قرص,Tablet,,,,,abc,\n"  # missing name_ar + bad price
    )
    batch = upload(client, csrf, content.encode()).json()
    actions = {r["data"]["code"] or r["line"]: (r["action"], r["errors"]) for r in batch["rows"]}
    assert actions["SKU-00001"] == ("create", [])
    assert actions["NEW-1"] == ("duplicate", ["barcode_belongs_to_other_item"])
    assert actions["NEW-2"] == ("duplicate", ["same_name_strength_form"])
    assert actions["NEW-3"][0] == "error"
    assert set(actions["NEW-3"][1]) == {"missing_name_ar", "invalid_price"}
    assert [r["action"] for r in batch["rows"] if r["line"] == 4] == ["error"]


def test_import_rejects_wrong_columns(world: World) -> None:
    client, csrf = owner(world)
    response = upload(client, csrf, b"foo,bar\n1,2\n")
    assert response.json()["detail"] == "missing_columns"


def test_export_round_trips_through_import(world: World) -> None:
    client, csrf = owner(world)
    batch = upload(client, csrf, make_csv(5)).json()
    client.post(f"/api/v1/catalog/imports/{batch['id']}/apply/", **csrf)
    exported = client.get("/api/v1/catalog/export/")
    assert exported["Content-Type"].startswith("text/csv")
    content = exported.content
    again = upload(client, csrf, content).json()
    assert again["summary"] == {"create": 0, "update": 5, "duplicate": 0, "error": 0}
