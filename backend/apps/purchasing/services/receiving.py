"""Goods receipts: drafts are edited freely; posting is one atomic, idempotent operation."""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.catalog.models import Item, ItemUnit
from apps.finance.money import money
from apps.finance.services.ledger import charge_supplier, post_journal
from apps.inventory.models import Batch, Location, StockMovement
from apps.inventory.services.stock import Move, apply_movements, location
from apps.purchasing.models import GoodsReceipt, GoodsReceiptLine, Supplier
from apps.sync.services.idempotency import run_once
from apps.sync.services.sequences import next_number
from apps.tenancy.models import Branch


class ReceiptError(Exception):
    def __init__(self, code: str, **detail: object) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


@dataclass
class LineInput:
    item_id: uuid.UUID
    unit_id: uuid.UUID
    quantity: int
    bonus_quantity: int
    unit_cost: Decimal
    discount: Decimal
    batch_no: str
    expiry_date: dt.date | None


def line_cost(quantity: int, unit_cost: Decimal, discount: Decimal) -> Decimal:
    return money(Decimal(quantity) * unit_cost - discount)


def cost_per_base(line: GoodsReceiptLine, factor: int, policy: str) -> Decimal:
    """Landed cost per base unit for one line under the bonus-cost policy."""
    total = line_cost(line.quantity, line.unit_cost, line.discount)
    paid_base = line.quantity * factor
    all_base = (line.quantity + line.bonus_quantity) * factor
    if policy == "bonus_as_income":
        return money(total / paid_base)
    if policy == "distribute":
        return money(total / all_base)
    raise ReceiptError("unknown_cost_policy", policy=policy)


@transaction.atomic
def save_draft(
    *,
    receipt: GoodsReceipt | None,
    branch: Branch,
    supplier: Supplier,
    supplier_invoice_no: str,
    invoice_date: dt.date,
    payment_terms_days: int,
    notes: str,
    lines: list[LineInput],
    user: User,
) -> GoodsReceipt:
    """Create or replace a draft receipt (header + lines)."""
    if receipt is not None:
        receipt = GoodsReceipt.objects.select_for_update().get(pk=receipt.pk)
        if receipt.status != GoodsReceipt.Status.DRAFT:
            raise ReceiptError("receipt_posted")
    duplicate = GoodsReceipt.objects.filter(
        supplier=supplier, supplier_invoice_no=supplier_invoice_no
    )
    if receipt is not None:
        duplicate = duplicate.exclude(pk=receipt.pk)
    if duplicate.exists():
        raise ReceiptError("supplier_invoice_exists")
    if receipt is None:
        receipt = GoodsReceipt(created_by=user)
    receipt.branch = branch
    receipt.supplier = supplier
    receipt.supplier_invoice_no = supplier_invoice_no
    receipt.invoice_date = invoice_date
    receipt.payment_terms_days = payment_terms_days
    receipt.notes = notes
    receipt.save()

    items = {i.pk: i for i in Item.objects.filter(pk__in={li.item_id for li in lines})}
    units = {u.pk: u for u in ItemUnit.objects.filter(pk__in={li.unit_id for li in lines})}
    receipt.lines.all().delete()
    rows = []
    for no, li in enumerate(lines, start=1):
        item, unit = items.get(li.item_id), units.get(li.unit_id)
        if item is None or unit is None or unit.item_id != item.pk:
            raise ReceiptError("unknown_item_or_unit", line=no)
        if li.quantity < 1 or li.bonus_quantity < 0 or li.unit_cost < 0 or li.discount < 0:
            raise ReceiptError("invalid_line", line=no)
        if li.discount > Decimal(li.quantity) * li.unit_cost:
            raise ReceiptError("discount_exceeds_line", line=no)
        rows.append(
            GoodsReceiptLine(
                receipt=receipt,
                line_no=no,
                item=item,
                unit=unit,
                quantity=li.quantity,
                bonus_quantity=li.bonus_quantity,
                unit_cost=money(li.unit_cost),
                discount=money(li.discount),
                batch_no=li.batch_no.strip(),
                expiry_date=li.expiry_date,
                organization_id=receipt.organization_id,
            )
        )
    GoodsReceiptLine.objects.bulk_create(rows)
    receipt.total = sum((line_cost(r.quantity, r.unit_cost, r.discount) for r in rows), Decimal(0))
    receipt.save(update_fields=["total", "updated_at"])
    return receipt


def _post(receipt: GoodsReceipt, user: User) -> dict[str, Any]:
    if receipt.status != GoodsReceipt.Status.DRAFT:
        raise ReceiptError("receipt_posted")
    lines = list(receipt.lines.select_related("unit", "item"))
    if not lines:
        raise ReceiptError("no_lines")
    policy = settings.RAFF_BONUS_COST_POLICY
    shelf = location(receipt.branch, Location.Kind.SELLABLE)
    review = location(receipt.branch, Location.Kind.REVIEW)
    receipt.number = next_number("receipt", "GR")

    moves: list[Move] = []
    bonus_value = Decimal(0)
    for line in lines:
        if not line.batch_no:
            raise ReceiptError("batch_required", line=line.line_no)
        factor = line.unit.factor
        line.base_quantity = (line.quantity + line.bonus_quantity) * factor
        line.cost_per_base = cost_per_base(line, factor, policy)
        line.held = line.expiry_date is None
        if policy == "bonus_as_income":
            bonus_value += money(line.cost_per_base * line.bonus_quantity * factor)

        batch, created = Batch.objects.select_for_update().get_or_create(
            item=line.item,
            batch_no=line.batch_no,
            defaults={"expiry_date": line.expiry_date, "unit_cost": line.cost_per_base},
        )
        if not created:
            if batch.expiry_date and line.expiry_date and batch.expiry_date != line.expiry_date:
                raise ReceiptError("batch_expiry_mismatch", line=line.line_no, batch=batch.batch_no)
            on_hand = sum(b.quantity_base for b in batch.balances.all())
            # Weighted cost of what is on hand and what arrives.
            batch.unit_cost = money(
                (batch.unit_cost * on_hand + line.cost_per_base * line.base_quantity)
                / (on_hand + line.base_quantity)
            )
            batch.expiry_date = batch.expiry_date or line.expiry_date
            batch.save(update_fields=["unit_cost", "expiry_date"])
        moves.append(
            Move(review if line.held else shelf, batch, line.base_quantity, line.cost_per_base)
        )

    apply_movements(
        receipt.branch,
        moves,
        kind=StockMovement.Kind.RECEIPT,
        document_type="goods_receipt",
        document_id=receipt.pk,
        user=user,
    )
    GoodsReceiptLine.objects.bulk_update(lines, ["base_quantity", "cost_per_base", "held"])
    inventory_value = receipt.total + bonus_value
    post_journal(
        branch=receipt.branch,
        date=receipt.invoice_date,
        document_type="goods_receipt",
        document_id=receipt.pk,
        lines=[
            ("1200", inventory_value, Decimal(0)),
            ("2000", Decimal(0), receipt.total),
            ("4100", Decimal(0), bonus_value),
        ],
        memo=receipt.supplier_invoice_no,
    )
    charge_supplier(
        receipt.supplier_id, receipt.total, document_type="goods_receipt", document_id=receipt.pk
    )
    record(
        "post",
        "goods_receipt",
        receipt.pk,
        actor=user,
        branch=receipt.branch,
        number=receipt.number,
        total=str(receipt.total),
    )
    receipt.status = GoodsReceipt.Status.POSTED
    receipt.posted_at = timezone.now()
    receipt.posted_by = user
    receipt.bonus_value = bonus_value
    receipt.save(
        update_fields=["number", "status", "posted_at", "posted_by", "bonus_value", "updated_at"]
    )
    return {
        "id": str(receipt.pk),
        "number": receipt.number,
        "total": str(receipt.total),
        "held_lines": sum(line.held for line in lines),
    }


@transaction.atomic
def post_receipt(
    receipt_id: uuid.UUID, *, idempotency_key: str | None, user: User
) -> dict[str, Any]:
    """Post a draft receipt: batches, landed costs, stock movements. Idempotent by key.

    Lock order (LOCKING.md): the receipt row first, then the idempotency record.
    """
    receipt = GoodsReceipt.objects.select_for_update().select_related("branch").get(pk=receipt_id)
    return run_once(
        "post_receipt", idempotency_key, {"receipt": str(receipt_id)}, lambda: _post(receipt, user)
    )


@transaction.atomic
def release_held(batch: Batch, branch: Branch, expiry_date: dt.date, user: User) -> int:
    """Give a held batch its expiry and move it from review to the sellable shelf."""
    batch = Batch.objects.select_for_update().get(pk=batch.pk)
    if batch.expiry_date and batch.expiry_date != expiry_date:
        raise ReceiptError("batch_expiry_mismatch", batch=batch.batch_no)
    review = location(branch, Location.Kind.REVIEW)
    shelf = location(branch, Location.Kind.SELLABLE)
    held = batch.balances.filter(location=review).first()
    quantity = held.quantity_base if held else 0
    if quantity == 0:
        raise ReceiptError("nothing_held")
    batch.expiry_date = expiry_date
    batch.save(update_fields=["expiry_date"])
    apply_movements(
        branch,
        [
            Move(review, batch, -quantity, batch.unit_cost),
            Move(shelf, batch, quantity, batch.unit_cost),
        ],
        kind=StockMovement.Kind.RELEASE,
        document_type="batch_release",
        document_id=batch.pk,
        user=user,
    )
    return quantity
