from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.tests.test_auth import csrf_client, login
from apps.inventory.models import Batch, Location, StockBalance, StockMovement
from apps.inventory.selectors import on_hand_by_movements, stock_for_items
from apps.purchasing.services.receiving import ReceiptError, post_receipt, release_held
from apps.tenancy.context import org_context
from tests.factories import World
from tests.stock import boxed_item, draft


def key() -> str:
    return str(uuid.uuid4())


def test_bonus_distributed_over_all_units_gives_cost_12(world: World) -> None:
    """10 + 2 bonus at 14.4 each: 144 spread over 12 boxes → 12 per box."""
    with org_context(world.org.id):
        item = boxed_item(factor=1)
        receipt = draft(
            world.khartoum, world.owner, item, quantity=10, bonus=2, unit_cost="14.4", unit="box"
        )
        result = post_receipt(receipt.pk, idempotency_key=key(), user=world.owner)
        line = receipt.lines.get()
        assert result["total"] == "144.0000"
        assert line.base_quantity == 12
        assert line.cost_per_base == Decimal("12.0000")
        assert stock_for_items(world.khartoum, [item])[item.pk].sellable_base == 12


@override_settings(RAFF_BONUS_COST_POLICY="bonus_as_income")
def test_bonus_as_income_keeps_paid_cost(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item(factor=1)
        receipt = draft(world.khartoum, world.owner, item, quantity=10, bonus=2, unit_cost="14.4")
        post_receipt(receipt.pk, idempotency_key=key(), user=world.owner)
        receipt.refresh_from_db()
        assert receipt.lines.get().cost_per_base == Decimal("14.4000")
        assert receipt.bonus_value == Decimal("28.8000")


def test_pack_units_are_stored_in_base_units(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item(factor=14)
        receipt = draft(world.khartoum, world.owner, item, quantity=40, bonus=4, unit_cost="9800")
        post_receipt(receipt.pk, idempotency_key=key(), user=world.owner)
        line = receipt.lines.get()
        assert line.base_quantity == 44 * 14
        assert line.cost_per_base == Decimal("636.3636")  # 392,000 / 616


def test_line_without_expiry_is_held_until_released(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item()
        receipt = draft(world.khartoum, world.owner, item, expiry=None, quantity=2)
        result = post_receipt(receipt.pk, idempotency_key=key(), user=world.owner)
        assert result["held_lines"] == 1
        stock = stock_for_items(world.khartoum, [item])[item.pk]
        assert (stock.sellable_base, stock.held_base) == (0, 28)
        batch = Batch.objects.get(item=item)
        assert release_held(batch, world.khartoum, dt.date(2030, 6, 30), world.owner) == 28
        stock = stock_for_items(world.khartoum, [item])[item.pk]
        assert (stock.sellable_base, stock.held_base) == (28, 0)
        assert stock.nearest_expiry == dt.date(2030, 6, 30)


def test_posting_twice_with_same_key_replays(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item()
        receipt = draft(world.khartoum, world.owner, item)
        k = key()
        first = post_receipt(receipt.pk, idempotency_key=k, user=world.owner)
        again = post_receipt(receipt.pk, idempotency_key=k, user=world.owner)
        assert first == again
        assert StockMovement.objects.filter(document_id=receipt.pk).count() == 1
        with pytest.raises(ReceiptError, match="receipt_posted"):
            post_receipt(receipt.pk, idempotency_key=key(), user=world.owner)


def test_re_receiving_a_batch_weights_its_cost(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item(factor=1)
        post_receipt(
            draft(world.khartoum, world.owner, item, quantity=10, unit_cost="10").pk,
            idempotency_key=key(),
            user=world.owner,
        )
        post_receipt(
            draft(
                world.khartoum, world.owner, item, invoice="INV-2", quantity=30, unit_cost="14"
            ).pk,
            idempotency_key=key(),
            user=world.owner,
        )
        assert Batch.objects.get(item=item).unit_cost == Decimal("13.0000")


def test_batch_with_conflicting_expiry_is_refused(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item()
        post_receipt(
            draft(world.khartoum, world.owner, item).pk, idempotency_key=key(), user=world.owner
        )
        other = draft(
            world.khartoum, world.owner, item, invoice="INV-2", expiry=dt.date(2031, 1, 1)
        )
        with pytest.raises(ReceiptError, match="batch_expiry_mismatch"):
            post_receipt(other.pk, idempotency_key=key(), user=world.owner)


def api(username: str = "owner") -> tuple[APIClient, dict[str, Any]]:
    client = csrf_client()
    login(client, username)
    return client, {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}


def receipt_payload(item_id: str, unit_id: str, invoice: str = "INV-API") -> dict[str, object]:
    return {
        "supplier_id": None,
        "supplier_invoice_no": invoice,
        "invoice_date": "2026-10-21",
        "payment_terms_days": 30,
        "lines": [
            {
                "item_id": item_id,
                "unit_id": unit_id,
                "quantity": 5,
                "bonus_quantity": 1,
                "unit_cost": "100",
                "batch_no": "B-9",
                "expiry_date": "2030-01-01",
            }
        ],
    }


def test_api_draft_post_and_immutability(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item()
        from tests.stock import supplier

        sup = supplier()
    client, csrf = api()
    client.post(
        "/api/v1/auth/context/", {"branch_id": str(world.khartoum.pk)}, format="json", **csrf
    )
    payload = receipt_payload(str(item.pk), str(item.units.get(code="box").pk))
    payload["supplier_id"] = str(sup.pk)
    created = client.post("/api/v1/purchasing/receipts/", payload, format="json", **csrf)
    assert created.status_code == 201, created.json()
    rid = created.json()["id"]
    assert created.json()["total"] == "500.0000"

    missing = client.post(f"/api/v1/purchasing/receipts/{rid}/post/", **csrf)
    assert missing.json() == {"detail": "idempotency_key_required"}
    k = key()
    posted = client.post(f"/api/v1/purchasing/receipts/{rid}/post/", HTTP_IDEMPOTENCY_KEY=k, **csrf)
    assert posted.status_code == 200
    assert posted.json()["number"] == "GR-000001"
    replayed = client.post(
        f"/api/v1/purchasing/receipts/{rid}/post/", HTTP_IDEMPOTENCY_KEY=k, **csrf
    )
    assert replayed.json() == posted.json()

    edit = client.put(f"/api/v1/purchasing/receipts/{rid}/", payload, format="json", **csrf)
    assert edit.json() == {"detail": "receipt_posted"}

    duplicate = client.post("/api/v1/purchasing/receipts/", payload, format="json", **csrf)
    assert duplicate.json() == {"detail": "supplier_invoice_exists"}

    payload["supplier_invoice_no"] = "INV-OTHER"
    other = client.post("/api/v1/purchasing/receipts/", payload, format="json", **csrf).json()
    reused = client.post(
        f"/api/v1/purchasing/receipts/{other['id']}/post/", HTTP_IDEMPOTENCY_KEY=k, **csrf
    )
    assert reused.status_code == 409

    stock = client.get("/api/v1/inventory/items/", {"q": "Item AUG"}).json()["results"][0]["stock"]
    assert stock["sellable_base"] == 6 * 14
    assert stock["status"] == "good"
    # 5 boxes at 100 + 1 bonus: 500 over 84 tablets = 5.9524 per tablet (stored at
    # 4 places, NUMERIC(18,4)), times 14 per box.
    assert stock["cost_per_sale_unit"] == "83.3336"
    batches = client.get(f"/api/v1/inventory/items/{item.pk}/batches/").json()
    assert [(b["batch_no"], b["quantity_base"], b["location"]) for b in batches] == [
        ("B-9", 84, "sellable")
    ]
    moves = client.get(f"/api/v1/inventory/items/{item.pk}/movements/").json()
    assert [m["kind"] for m in moves] == ["receipt"]


def test_cashier_cannot_receive(world: World) -> None:
    client, csrf = api("salma")
    assert client.post("/api/v1/purchasing/receipts/", {}, format="json", **csrf).status_code == 403


def test_balance_equals_movement_log(world: World) -> None:
    with org_context(world.org.id):
        item = boxed_item()
        for i in range(3):
            post_receipt(
                draft(
                    world.khartoum,
                    world.owner,
                    item,
                    invoice=f"INV-{i}",
                    batch=f"B-{i}",
                    quantity=i + 1,
                ).pk,
                idempotency_key=key(),
                user=world.owner,
            )
        balances = sum(
            StockBalance.objects.filter(branch=world.khartoum, item=item).values_list(
                "quantity_base", flat=True
            )
        )
        assert balances == on_hand_by_movements(world.khartoum, item) == 6 * 14
        assert Location.objects.filter(branch=world.khartoum).count() == 2
