"""post_return: refund part of a sale; the goods go to quarantine (CLAUDE.md rule 6, LOCKING.md).

The sale row is the document lock: every return of the same sale waits for it, so the
cumulative cap (never more than sold) holds under concurrency.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Sum

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.finance.money import money
from apps.finance.services.ledger import charge_customer, post_journal
from apps.inventory.models import Location, QuarantineEntry, StockMovement
from apps.inventory.services.quarantine import hold
from apps.inventory.services.stock import Move, apply_movements, location
from apps.returns.models import SaleReturn, SaleReturnAllocation, SaleReturnLine
from apps.sales.models import Payment, Sale, SaleLine, Shift
from apps.sync.services.idempotency import run_once
from apps.sync.services.sequences import next_number
from apps.tenancy import clock
from apps.tenancy.models import Device


class ReturnError(Exception):
    def __init__(self, code: str, **detail: object) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class ReturnLineRequest:
    sale_line_id: uuid.UUID
    quantity: int
    reason: str
    condition: str


def returned(line_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[int, Decimal]]:
    """Quantity (in the line's unit) and amount already returned, per sale line."""
    rows = (
        SaleReturnLine.objects.filter(sale_line_id__in=line_ids)
        .values("sale_line_id")
        .annotate(q=Sum("quantity"), a=Sum("amount"))
    )
    return {r["sale_line_id"]: (r["q"] or 0, r["a"] or Decimal(0)) for r in rows}


def returned_by_batch(line: SaleLine) -> dict[uuid.UUID, int]:
    out: dict[uuid.UUID, int] = defaultdict(int)
    for a in SaleReturnAllocation.objects.filter(line__sale_line=line):
        out[a.batch_id] += a.base_quantity
    return out


def return_payload(
    sale_id: uuid.UUID, refund: str, lines: list[ReturnLineRequest]
) -> dict[str, Any]:
    return {
        "sale": str(sale_id),
        "refund": refund,
        "lines": [
            [str(r.sale_line_id), r.quantity, r.reason, r.condition]
            for r in sorted(lines, key=lambda r: str(r.sale_line_id))
        ],
    }


def price(
    sale: Sale, requests: list[ReturnLineRequest]
) -> list[tuple[SaleLine, ReturnLineRequest, int, Decimal]]:
    """Check each requested line against what is left and price the refund (server-side)."""
    if not requests:
        raise ReturnError("no_lines")
    lines = {line.pk: line for line in sale.lines.select_related("item", "unit")}
    done = returned(list(lines))
    seen: set[uuid.UUID] = set()
    priced: list[tuple[SaleLine, ReturnLineRequest, int, Decimal]] = []
    for r in requests:
        line = lines.get(r.sale_line_id)
        if line is None or r.sale_line_id in seen:
            raise ReturnError("unknown_line", line=r.sale_line_id)
        seen.add(r.sale_line_id)
        if r.reason not in SaleReturnLine.Reason.values:
            raise ReturnError("invalid_reason", line=line.line_no)
        if r.condition not in SaleReturnLine.Condition.values:
            raise ReturnError("invalid_condition", line=line.line_no)
        qty_done, amount_done = done.get(line.pk, (0, Decimal(0)))
        left = line.quantity - qty_done
        if r.quantity <= 0 or r.quantity > left:
            raise ReturnError("exceeds_sold", line=line.line_no, available=left)
        # The last return of a line refunds exactly what is left, so rounding never drifts.
        amount = (
            money(line.line_total - amount_done)
            if r.quantity == left
            else money(line.line_total * r.quantity / line.quantity)
        )
        priced.append((line, r, r.quantity * line.unit.factor, amount))
    return priced


def quote_return(sale: Sale, requests: list[ReturnLineRequest]) -> Decimal:
    return money(sum((p[3] for p in price(sale, requests)), Decimal(0)))


def _post(
    sale: Sale, device: Device, refund: str, requests: list[ReturnLineRequest], user: User, key: str
) -> dict[str, Any]:
    if sale.branch_id != device.branch_id:
        raise ReturnError("other_branch")
    if refund not in SaleReturn.Refund.values:
        raise ReturnError("invalid_refund")
    if refund == SaleReturn.Refund.ACCOUNT and sale.customer is None:
        raise ReturnError("no_customer")
    shift = None
    if refund == SaleReturn.Refund.CASH:
        shift = Shift.objects.filter(device=device, status=Shift.Status.OPEN).first()
        if shift is None:
            raise ReturnError("shift_closed")
    priced = price(sale, requests)
    total = money(sum((p[3] for p in priced), Decimal(0)))
    sale_return = SaleReturn.objects.create(
        number=next_number("return", "RET"),
        branch=sale.branch,
        sale=sale,
        shift=shift,
        refund_method=refund,
        total=total,
        cost_total=Decimal(0),
        idempotency_key=key,
        created_by=user,
    )
    # Undo the most recently allocated batches first.
    plan: list[tuple[SaleReturnLine, list[tuple[Any, int, Decimal]]]] = []
    for line, r, base, amount in priced:
        back = returned_by_batch(line)
        taken: list[tuple[Any, int, Decimal]] = []
        need = base
        for alloc in sorted(
            line.allocations.select_related("batch"), key=lambda a: str(a.pk), reverse=True
        ):
            free = alloc.base_quantity - back.get(alloc.batch_id, 0)
            q = min(need, free)
            if q > 0:
                taken.append((alloc.batch, q, alloc.unit_cost))
                back[alloc.batch_id] = back.get(alloc.batch_id, 0) + q
                need -= q
        if need:
            raise ReturnError("exceeds_sold", line=line.line_no, available=base - need)
        cost = money(sum((c * q for _, q, c in taken), Decimal(0)))
        row = SaleReturnLine.objects.create(
            sale_return=sale_return,
            sale_line=line,
            quantity=r.quantity,
            base_quantity=base,
            amount=amount,
            cost=cost,
            reason=r.reason,
            condition=r.condition,
        )
        plan.append((row, taken))

    held = location(sale.branch, Location.Kind.QUARANTINE)
    apply_movements(
        sale.branch,
        [Move(held, batch, q, c) for _, taken in plan for batch, q, c in taken],
        kind=StockMovement.Kind.RETURN,
        document_type="return",
        document_id=sale_return.pk,
        user=user,
    )
    cost_total = Decimal(0)
    for row, taken in plan:
        cost_total += row.cost
        SaleReturnAllocation.objects.bulk_create(
            [
                SaleReturnAllocation(
                    line=row,
                    batch=batch,
                    base_quantity=q,
                    unit_cost=c,
                    organization_id=sale_return.organization_id,
                )
                for batch, q, c in taken
            ]
        )
        for batch, q, c in taken:
            hold(
                sale.branch,
                batch,
                q,
                c,
                source=QuarantineEntry.Source.RETURN,
                source_id=sale_return.pk,
                reason=row.reason,
                user=user,
            )
    sale_return.cost_total = money(cost_total)
    sale_return.save(update_fields=["cost_total"])

    credit = "1000" if refund == SaleReturn.Refund.CASH else "1100"
    journal = [("4000", total, Decimal(0)), (credit, Decimal(0), total)]
    if cost_total:
        journal += [
            ("1200", money(cost_total), Decimal(0)),
            ("5000", Decimal(0), money(cost_total)),
        ]
    post_journal(
        branch=sale.branch,
        date=clock.today(),
        document_type="return",
        document_id=sale_return.pk,
        lines=journal,
        memo=sale_return.number,
    )
    if refund == SaleReturn.Refund.ACCOUNT and sale.customer is not None and total:
        charge_customer(
            sale.customer,
            -total,
            document_type="return",
            document_id=sale_return.pk,
            enforce_limit=False,
        )
    record(
        "post",
        "return",
        sale_return.pk,
        actor=user,
        branch=sale.branch,
        sale=sale.number,
        total=str(total),
        refund=refund,
    )
    return {"id": str(sale_return.pk), "number": sale_return.number, "total": str(total)}


@transaction.atomic
def post_return(
    *,
    sale_id: uuid.UUID,
    device: Device,
    refund: str,
    lines: list[ReturnLineRequest],
    idempotency_key: str | None,
    user: User,
) -> dict[str, Any]:
    """Lock order: the sale (document) → idempotency → sequence → balances → customer."""
    sale = (
        Sale.objects.select_for_update(of=("self",))
        .select_related("branch", "customer")
        .filter(pk=sale_id)
        .first()
    )
    if sale is None:
        raise ReturnError("unknown_sale")
    return run_once(
        "post_return",
        idempotency_key,
        return_payload(sale_id, refund, lines),
        lambda: _post(sale, device, refund, lines, user, idempotency_key or ""),
    )


def default_refund(sale: Sale) -> str:
    """Credit sales are refunded to the account, everything else in cash."""
    credit = sale.payments.filter(method=Payment.Method.CREDIT).exists()
    return SaleReturn.Refund.ACCOUNT if credit and sale.customer_id else SaleReturn.Refund.CASH
