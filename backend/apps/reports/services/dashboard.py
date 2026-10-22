"""Overview (Raff Screens: نظرة عامة): what needs action, today's figures, the last 7 days."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.catalog.models import Item
from apps.finance.models import Customer
from apps.finance.money import money
from apps.inventory.models import Location, StockBalance
from apps.tenancy import clock
from apps.tenancy.models import Branch


def _day_span(day: dt.date) -> tuple[dt.datetime, dt.datetime]:
    tz = timezone.get_current_timezone()
    start = dt.datetime.combine(day, dt.time.min, tzinfo=tz)
    return start, start + dt.timedelta(days=1)


def overview(branches: list[Branch]) -> dict[str, Any]:
    from apps.returns.models import SaleReturn
    from apps.sales.models import Payment, Sale, Shift
    from apps.transfers.models import Transfer

    today = clock.today()
    start, end = _day_span(today)
    in_scope = Q(branch__in=branches)

    near = today + dt.timedelta(days=settings.RAFF_NEAR_EXPIRY_DAYS)
    expiring = (
        StockBalance.objects.filter(
            in_scope,
            quantity_base__gt=0,
            location__kind=Location.Kind.SELLABLE,
            batch__expiry_date__lte=near,
        )
        .values("item_id")
        .distinct()
        .count()
    )
    shelf = {
        r["item_id"]: r["q"]
        for r in StockBalance.objects.filter(in_scope, location__kind=Location.Kind.SELLABLE)
        .values("item_id")
        .annotate(q=Sum("quantity_base"))
    }
    below = sum(
        1
        for pk, level in Item.objects.filter(is_active=True, reorder_level_base__gt=0).values_list(
            "pk", "reorder_level_base"
        )
        if (shelf.get(pk) or 0) < level
    )
    receivables = Customer.objects.filter(balance__gt=0).count()
    unsettled = (
        Shift.objects.filter(in_scope, status=Shift.Status.CLOSED, settled_at__isnull=True)
        .exclude(variance=0)
        .count()
    )
    awaiting = Transfer.objects.filter(to_branch__in=branches, status=Transfer.Status.SENT).count()

    sales_today = Sale.objects.filter(in_scope, posted_at__gte=start, posted_at__lt=end)
    totals = sales_today.aggregate(total=Sum("total"), count=Count("id"))
    by_method = {
        r["method"]: r["s"]
        for r in Payment.objects.filter(sale__in=sales_today)
        .values("method")
        .annotate(s=Sum("amount"))
    }
    refunds = SaleReturn.objects.filter(
        in_scope, posted_at__gte=start, posted_at__lt=end, refund_method="cash"
    ).aggregate(s=Sum("total"))["s"] or Decimal(0)

    open_shift = (
        Shift.objects.filter(in_scope, status=Shift.Status.OPEN)
        .select_related("opened_by", "device")
        .order_by("opened_at")
        .first()
    )
    week = []
    for back in range(6, -1, -1):
        day = today - dt.timedelta(days=back)
        s, e = _day_span(day)
        total = Sale.objects.filter(in_scope, posted_at__gte=s, posted_at__lt=e).aggregate(
            t=Sum("total")
        )["t"]
        week.append({"date": day, "total": money(total or 0)})

    latest: list[dict[str, Any]] = []
    for sale in (
        Sale.objects.filter(in_scope).prefetch_related("payments").order_by("-posted_at")[:5]
    ):
        pending = any(p.verification == Payment.Verification.PENDING for p in sale.payments.all())
        latest.append(
            {
                "at": sale.posted_at,
                "kind": "sale",
                "number": sale.number,
                "amount": sale.total,
                "status": "verifying" if pending else "approved",
            }
        )
    for ret in SaleReturn.objects.filter(in_scope).order_by("-posted_at")[:5]:
        latest.append(
            {
                "at": ret.posted_at,
                "kind": "return",
                "number": ret.number,
                "amount": ret.total,
                "status": "to_inspect",
            }
        )
    latest.sort(key=lambda r: r["at"], reverse=True)

    return {
        "needs_action": {
            "expiring": expiring,
            "below_reorder": below,
            "receivables": receivables,
            "unsettled_shifts": unsettled,
            "transfers_awaiting": awaiting,
            "store_orders": 0,
            "pending_sync": 0,
        },
        "sales_today": money(totals["total"] or 0),
        "sales_count": totals["count"],
        "cash_today": money((by_method.get("cash") or 0) - refunds),
        "bank_today": money(by_method.get("bank") or 0),
        "open_shift": None
        if open_shift is None
        else {
            "number": open_shift.number,
            "opened_at": open_shift.opened_at,
            "user_ar": open_shift.opened_by.display_name_ar,
            "user_en": open_shift.opened_by.display_name_en,
        },
        "week": week,
        "latest": latest[:5],
    }
