"""Opening and closing shifts at a counter."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.services.log import record
from apps.finance.money import money
from apps.finance.services.ledger import post_journal
from apps.sales.models import Payment, Shift
from apps.sync.services.idempotency import run_once
from apps.tenancy import clock
from apps.tenancy.models import Device


class ShiftError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def open_shift_for(device: Device) -> Shift | None:
    shift: Shift | None = Shift.objects.filter(device=device, status=Shift.Status.OPEN).first()
    return shift


@transaction.atomic
def open_shift(device: Device, user: User, opening_cash: Decimal) -> Shift:
    if opening_cash < 0:
        raise ShiftError("invalid_opening")
    if open_shift_for(device):
        raise ShiftError("shift_already_open")
    number = (Shift.objects.filter(branch=device.branch).aggregate(n=Max("number"))["n"] or 0) + 1
    shift: Shift = Shift.objects.create(
        number=number,
        branch=device.branch,
        device=device,
        opened_by=user,
        opening_cash=money(opening_cash),
    )
    record(
        "open",
        "shift",
        shift.pk,
        actor=user,
        branch=device.branch,
        opening_cash=str(shift.opening_cash),
    )
    return shift


def cash_taken(shift: Shift) -> Decimal:
    """Cash sales less cash refunds paid from this shift's drawer."""
    total = Payment.objects.filter(sale__shift=shift, method=Payment.Method.CASH).aggregate(
        s=Sum("amount")
    )["s"]
    from apps.returns.models import SaleReturn  # returns depend on sales, not the reverse

    refunds = SaleReturn.objects.filter(
        shift=shift, refund_method=SaleReturn.Refund.CASH
    ).aggregate(s=Sum("total"))["s"]
    return money((total or 0) - (refunds or 0))


def summary(shift: Shift) -> dict[str, Any]:
    by_method = {
        row["method"]: money(row["s"])
        for row in Payment.objects.filter(sale__shift=shift)
        .values("method")
        .annotate(s=Sum("amount"))
    }
    sales = shift.sales.aggregate(total=Sum("total"))["total"] or Decimal(0)
    return {
        "sales_total": money(sales),
        "sales_count": shift.sales.count(),
        "cash": by_method.get("cash", Decimal(0)),
        "bank": by_method.get("bank", Decimal(0)),
        "credit": by_method.get("credit", Decimal(0)),
        "expected_cash": money(shift.opening_cash + cash_taken(shift)),
    }


def _close(shift: Shift, counted: Decimal, user: User) -> dict[str, Any]:
    if shift.status != Shift.Status.OPEN:
        raise ShiftError("shift_closed")
    expected = money(shift.opening_cash + cash_taken(shift))
    variance = money(counted - expected)
    if variance:
        post_journal(
            branch=shift.branch,
            date=clock.today(),
            document_type="shift_close",
            document_id=shift.pk,
            lines=[("5200", -variance, Decimal(0)), ("1000", Decimal(0), -variance)]
            if variance < 0
            else [("1000", variance, Decimal(0)), ("5200", Decimal(0), variance)],
        )
    shift.status = Shift.Status.CLOSED
    shift.closed_by = user
    shift.closed_at = timezone.now()
    shift.expected_cash = expected
    shift.counted_cash = money(counted)
    shift.variance = variance
    shift.save()
    record("close", "shift", shift.pk, actor=user, branch=shift.branch, variance=str(variance))
    return {
        "id": str(shift.pk),
        "expected_cash": str(expected),
        "counted_cash": str(shift.counted_cash),
        "variance": str(variance),
    }


@transaction.atomic
def close_shift(
    shift_id: uuid.UUID, counted: Decimal, *, idempotency_key: str | None, user: User
) -> dict[str, Any]:
    """Count the cash and close. Lock order: the shift (the document) first."""
    shift = Shift.objects.select_for_update(of=("self",)).select_related("branch").get(pk=shift_id)
    return run_once(
        "close_shift",
        idempotency_key,
        {"shift": str(shift_id), "counted": str(counted)},
        lambda: _close(shift, counted, user),
    )


@transaction.atomic
def settle(shift_id: uuid.UUID, user: User) -> Shift:
    """A manager reviews a closed shift's cash variance and marks it settled."""
    shift: Shift = Shift.objects.select_for_update().get(pk=shift_id)
    if shift.status != Shift.Status.CLOSED:
        raise ShiftError("shift_open")
    if shift.settled_at is None:
        shift.settled_by = user
        shift.settled_at = timezone.now()
        shift.save(update_fields=["settled_by", "settled_at"])
        record(
            "settle",
            "shift",
            shift.pk,
            actor=user,
            branch=shift.branch,
            variance=str(shift.variance),
        )
    return shift
