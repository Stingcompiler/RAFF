"""Branch transfers: draft → sent (in transit) → received (closed or partly received)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.finance.money import money
from apps.finance.services.ledger import post_journal
from apps.inventory.models import Batch, Location, StockMovement
from apps.inventory.services.stock import Move, apply_movements, location
from apps.sync.services.idempotency import run_once
from apps.sync.services.sequences import next_number
from apps.tenancy import clock
from apps.tenancy.models import Branch
from apps.transfers.models import Transfer, TransferLine


class TransferError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class LineInput:
    batch_id: uuid.UUID
    quantity_base: int


def in_sale_units(lines: list[dict[str, Any]]) -> list[LineInput]:
    """Lines entered in each item's default sale unit, converted to base units."""
    batches = {
        b.pk: b
        for b in Batch.objects.filter(pk__in=[li["batch_id"] for li in lines]).prefetch_related(
            "item__units"
        )
    }
    out = []
    for li in lines:
        batch = batches.get(li["batch_id"])
        if batch is None:
            raise TransferError("invalid_line")
        units = list(batch.item.units.all())
        unit = next((u for u in units if u.is_default_sale), None) or next(
            (u for u in units if u.is_base), None
        )
        out.append(LineInput(batch.pk, li["quantity"] * (unit.factor if unit else 1)))
    return out


@transaction.atomic
def save_draft(
    *,
    transfer: Transfer | None,
    from_branch: Branch,
    to_branch: Branch,
    lines: list[LineInput],
    note: str,
    user: User,
) -> Transfer:
    if from_branch.pk == to_branch.pk:
        raise TransferError("same_branch")
    if not lines:
        raise TransferError("no_lines")
    if transfer is None:
        transfer = Transfer.objects.create(
            from_branch=from_branch, to_branch=to_branch, note=note, created_by=user
        )
    else:
        transfer = Transfer.objects.select_for_update().get(pk=transfer.pk)
        if transfer.status != Transfer.Status.DRAFT:
            raise TransferError("not_a_draft")
        transfer.to_branch = to_branch
        transfer.note = note
        transfer.save(update_fields=["to_branch", "note"])
        transfer.lines.all().delete()
    batches = {b.pk: b for b in Batch.objects.filter(pk__in=[li.batch_id for li in lines])}
    rows = []
    for li in lines:
        batch = batches.get(li.batch_id)
        if batch is None or li.quantity_base <= 0:
            raise TransferError("invalid_line")
        rows.append(
            TransferLine(
                transfer=transfer,
                item_id=batch.item_id,
                batch=batch,
                quantity_base=li.quantity_base,
                unit_cost=batch.unit_cost,
                organization_id=transfer.organization_id,
            )
        )
    TransferLine.objects.bulk_create(rows)
    return transfer


def _send(transfer: Transfer, user: User) -> dict[str, Any]:
    if transfer.status != Transfer.Status.DRAFT:
        raise TransferError("not_a_draft")
    lines = list(transfer.lines.select_related("batch"))
    shelf = location(transfer.from_branch, Location.Kind.SELLABLE)
    transit = location(transfer.from_branch, Location.Kind.TRANSIT)
    transfer.number = next_number("transfer", "T", width=4)
    moves = []
    for line in lines:
        moves.append(Move(shelf, line.batch, -line.quantity_base, line.batch.unit_cost))
        moves.append(Move(transit, line.batch, line.quantity_base, line.batch.unit_cost))
    apply_movements(
        transfer.from_branch,
        moves,
        kind=StockMovement.Kind.TRANSFER_OUT,
        document_type="transfer",
        document_id=transfer.pk,
        user=user,
    )
    for line in lines:
        line.unit_cost = line.batch.unit_cost
    TransferLine.objects.bulk_update(lines, ["unit_cost"])
    transfer.status = Transfer.Status.SENT
    transfer.sent_by = user
    transfer.sent_at = timezone.now()
    transfer.save(update_fields=["number", "status", "sent_by", "sent_at"])
    value = money(sum((li.unit_cost * li.quantity_base for li in lines), Decimal(0)))
    record(
        "send", "transfer", transfer.pk, actor=user, branch=transfer.from_branch, value=str(value)
    )
    return {"id": str(transfer.pk), "number": transfer.number, "status": transfer.status}


@transaction.atomic
def send(transfer_id: uuid.UUID, *, idempotency_key: str | None, user: User) -> dict[str, Any]:
    transfer = (
        Transfer.objects.select_for_update(of=("self",))
        .select_related("from_branch", "to_branch")
        .get(pk=transfer_id)
    )
    return run_once(
        "transfer_send",
        idempotency_key,
        {"transfer": str(transfer_id)},
        lambda: _send(transfer, user),
    )


def _receive(transfer: Transfer, received: dict[str, int], user: User) -> dict[str, Any]:
    if transfer.status != Transfer.Status.SENT:
        raise TransferError("not_sent")
    lines = list(transfer.lines.select_related("batch"))
    transit = location(transfer.from_branch, Location.Kind.TRANSIT)
    shelf = location(transfer.to_branch, Location.Kind.SELLABLE)
    out_moves, in_moves = [], []
    shortfall = Decimal(0)
    for line in lines:
        got = received.get(str(line.pk), line.quantity_base)
        if got < 0 or got > line.quantity_base:
            raise TransferError("invalid_received")
        line.received_base = got
        out_moves.append(Move(transit, line.batch, -line.quantity_base, line.unit_cost))
        if got:
            in_moves.append(Move(shelf, line.batch, got, line.unit_cost))
        shortfall += line.unit_cost * (line.quantity_base - got)
    apply_movements(
        transfer.from_branch,
        out_moves,
        kind=StockMovement.Kind.TRANSFER_OUT,
        document_type="transfer",
        document_id=transfer.pk,
        user=user,
    )
    if in_moves:
        apply_movements(
            transfer.to_branch,
            in_moves,
            kind=StockMovement.Kind.TRANSFER_IN,
            document_type="transfer",
            document_id=transfer.pk,
            user=user,
        )
    TransferLine.objects.bulk_update(lines, ["received_base"])
    shortfall = money(shortfall)
    if shortfall:
        post_journal(
            branch=transfer.to_branch,
            date=clock.today(),
            document_type="transfer",
            document_id=transfer.pk,
            lines=[("5100", shortfall, Decimal(0)), ("1200", Decimal(0), shortfall)],
            memo=f"{transfer.number} shortfall",
        )
    transfer.status = (
        Transfer.Status.PARTIAL
        if shortfall or any(li.received_base != li.quantity_base for li in lines)
        else Transfer.Status.CLOSED
    )
    transfer.received_by = user
    transfer.received_at = timezone.now()
    transfer.save(update_fields=["status", "received_by", "received_at"])
    record(
        "receive",
        "transfer",
        transfer.pk,
        actor=user,
        branch=transfer.to_branch,
        shortfall=str(shortfall),
    )
    return {"id": str(transfer.pk), "number": transfer.number, "status": transfer.status}


@transaction.atomic
def receive(
    transfer_id: uuid.UUID, received: dict[str, int], *, idempotency_key: str | None, user: User
) -> dict[str, Any]:
    transfer = (
        Transfer.objects.select_for_update(of=("self",))
        .select_related("from_branch", "to_branch")
        .get(pk=transfer_id)
    )
    return run_once(
        "transfer_receive",
        idempotency_key,
        {"transfer": str(transfer_id), "received": sorted(received.items())},
        lambda: _receive(transfer, received, user),
    )
