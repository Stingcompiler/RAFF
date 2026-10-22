"""The seven reports (UI brief §7.10). Every figure is summed from posted documents, so each
total traces back to them (see tests/test_trace.py)."""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.conf import settings
from django.db.models import Max, Q, Sum
from django.utils import timezone

from apps.catalog.models import Item, ItemUnit
from apps.finance.models import Customer, PartyLedgerEntry
from apps.finance.money import money
from apps.finance.services.ledger import supplier_balance
from apps.inventory.models import Location, StockBalance, StockMovement
from apps.tenancy import clock
from apps.tenancy.models import Branch


@dataclass(frozen=True)
class Column:
    key: str
    label_ar: str
    label_en: str
    kind: str = "text"  # text | code | number | money | date | percent


@dataclass
class Report:
    name: str
    columns: list[Column]
    rows: list[dict[str, Any]] = field(default_factory=list)
    totals: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Params:
    branch: Branch
    start: dt.date
    end: dt.date
    days: int


ITEM = Column("item", "الصنف", "Item")
CODE = Column("code", "الرمز", "Code", "code")


def _units(items: list[Item]) -> dict[Any, ItemUnit | None]:
    out: dict[Any, ItemUnit | None] = {}
    for item in items:
        units = list(item.units.all())
        out[item.pk] = next((u for u in units if u.is_default_sale), None) or next(
            (u for u in units if u.is_base), None
        )
    return out


def _in_units(base: int, unit: ItemUnit | None) -> Decimal:
    factor = unit.factor if unit else 1
    return (Decimal(base) / factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _span(p: Params) -> tuple[dt.datetime, dt.datetime]:
    tz = timezone.get_current_timezone()
    start = dt.datetime.combine(p.start, dt.time.min, tzinfo=tz)
    end = dt.datetime.combine(p.end + dt.timedelta(days=1), dt.time.min, tzinfo=tz)
    return start, end


def gross_profit(p: Params) -> Report:
    from apps.returns.models import SaleReturnLine
    from apps.sales.models import SaleLine

    start, end = _span(p)
    report = Report(
        "gross_profit",
        [
            CODE,
            ITEM,
            Column("quantity", "الكمية", "Quantity", "number"),
            Column("revenue", "المبيعات", "Revenue", "money"),
            Column("cost", "التكلفة", "Cost", "money"),
            Column("profit", "الربح", "Profit", "money"),
            Column("margin", "الهامش %", "Margin %", "percent"),
        ],
    )
    sold = (
        SaleLine.objects.filter(
            sale__branch=p.branch, sale__posted_at__gte=start, sale__posted_at__lt=end
        )
        .values("item_id")
        .annotate(base=Sum("base_quantity"), revenue=Sum("line_total"), cost=Sum("cost_total"))
    )
    back = (
        SaleReturnLine.objects.filter(
            sale_return__branch=p.branch,
            sale_return__posted_at__gte=start,
            sale_return__posted_at__lt=end,
        )
        .values("sale_line__item_id")
        .annotate(base=Sum("base_quantity"), revenue=Sum("amount"), cost=Sum("cost"))
    )
    agg: dict[Any, list[Decimal]] = defaultdict(lambda: [Decimal(0)] * 3)
    for r in sold:
        a = agg[r["item_id"]]
        agg[r["item_id"]] = [a[0] + r["base"], a[1] + r["revenue"], a[2] + r["cost"]]
    for r in back:
        a = agg[r["sale_line__item_id"]]
        agg[r["sale_line__item_id"]] = [a[0] - r["base"], a[1] - r["revenue"], a[2] - r["cost"]]
    items = list(Item.objects.filter(pk__in=agg).prefetch_related("units").order_by("code"))
    units = _units(items)
    totals = [Decimal(0)] * 3
    for item in items:
        base, revenue, cost = agg[item.pk]
        profit = money(revenue - cost)
        report.rows.append(
            {
                "code": item.code,
                "item": item.name_ar,
                "item_en": item.name_en,
                "quantity": _in_units(int(base), units[item.pk]),
                "revenue": money(revenue),
                "cost": money(cost),
                "profit": profit,
                "margin": _pct(profit, revenue),
            }
        )
        totals = [totals[0] + revenue, totals[1] + cost, totals[2] + profit]
    report.totals = {
        "revenue": money(totals[0]),
        "cost": money(totals[1]),
        "profit": money(totals[2]),
        "margin": _pct(totals[2], totals[0]),
    }
    return report


def _pct(part: Decimal, whole: Decimal) -> Decimal | None:
    if not whole:
        return None
    return (part * 100 / whole).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def _balances(p: Params) -> dict[Any, dict[str, Any]]:
    rows = (
        StockBalance.objects.filter(branch=p.branch, quantity_base__gt=0)
        .select_related("batch", "location")
        .order_by("item_id")
    )
    out: dict[Any, dict[str, Any]] = defaultdict(
        lambda: {"sellable": 0, "other": 0, "value": Decimal(0)}
    )
    for b in rows:
        row = out[b.item_id]
        key = "sellable" if b.location.kind == Location.Kind.SELLABLE else "other"
        row[key] += b.quantity_base
        row["value"] += b.batch.unit_cost * b.quantity_base
    return out


def stock_value(p: Params) -> Report:
    report = Report(
        "stock_value",
        [
            CODE,
            ITEM,
            Column("sellable", "على الرف", "On the shelf", "number"),
            Column("other", "محجوز/حجر/نقل", "Held / quarantine / transit", "number"),
            Column("value", "القيمة بالتكلفة", "Value at cost", "money"),
        ],
    )
    stock = _balances(p)
    items = list(Item.objects.filter(pk__in=stock).prefetch_related("units").order_by("code"))
    units = _units(items)
    total = Decimal(0)
    for item in items:
        s = stock[item.pk]
        report.rows.append(
            {
                "code": item.code,
                "item": item.name_ar,
                "item_en": item.name_en,
                "sellable": _in_units(s["sellable"], units[item.pk]),
                "other": _in_units(s["other"], units[item.pk]),
                "value": money(s["value"]),
            }
        )
        total += s["value"]
    report.totals = {"value": money(total)}
    return report


def expiry(p: Params) -> Report:
    report = Report(
        "expiry",
        [
            ITEM,
            Column("batch", "الدفعة", "Batch", "code"),
            Column("quantity", "الكمية", "Qty", "number"),
            Column("expiry", "الصلاحية", "Expiry", "date"),
            Column("value", "القيمة", "Value", "money"),
        ],
    )
    limit = clock.today() + dt.timedelta(days=p.days)
    rows = (
        StockBalance.objects.filter(
            branch=p.branch,
            quantity_base__gt=0,
            location__kind=Location.Kind.SELLABLE,
            batch__expiry_date__lte=limit,
        )
        .select_related("batch", "item")
        .prefetch_related("item__units")
        .order_by("batch__expiry_date", "item__code")
    )
    total = Decimal(0)
    for b in rows:
        unit = _units([b.item])[b.item_id]
        value = money(b.batch.unit_cost * b.quantity_base)
        report.rows.append(
            {
                "item": b.item.name_ar,
                "item_en": b.item.name_en,
                "batch": b.batch.batch_no,
                "quantity": _in_units(b.quantity_base, unit),
                "expiry": b.batch.expiry_date,
                "value": value,
            }
        )
        total += value
    report.totals = {"value": money(total)}
    return report


def shortages(p: Params) -> Report:
    report = Report(
        "shortages",
        [
            CODE,
            ITEM,
            Column("on_hand", "الرصيد", "On hand", "number"),
            Column("reorder", "حد الطلب", "Reorder level", "number"),
        ],
    )
    stock = _balances(p)
    items = list(Item.objects.filter(is_active=True).prefetch_related("units").order_by("code"))
    units = _units(items)
    for item in items:
        on_hand = stock[item.pk]["sellable"] if item.pk in stock else 0
        if on_hand > 0 and on_hand >= item.reorder_level_base:
            continue
        report.rows.append(
            {
                "code": item.code,
                "item": item.name_ar,
                "item_en": item.name_en,
                "on_hand": _in_units(on_hand, units[item.pk]),
                "reorder": _in_units(item.reorder_level_base, units[item.pk]),
            }
        )
    report.totals = {"count": len(report.rows)}
    return report


def slow_moving(p: Params) -> Report:
    report = Report(
        "slow_moving",
        [
            CODE,
            ITEM,
            Column("on_hand", "الرصيد", "On hand", "number"),
            Column("last_sale", "آخر بيع", "Last sale", "date"),
            Column("value", "القيمة", "Value", "money"),
        ],
    )
    stock = _balances(p)
    since = clock.today() - dt.timedelta(days=p.days)
    last = {
        r["item_id"]: r["last"]
        for r in StockMovement.objects.filter(branch=p.branch, kind=StockMovement.Kind.SALE)
        .values("item_id")
        .annotate(last=Max("created_at"))
    }
    items = list(Item.objects.filter(pk__in=stock).prefetch_related("units").order_by("code"))
    units = _units(items)
    total = Decimal(0)
    for item in items:
        sold = last.get(item.pk)
        if sold is not None and timezone.localdate(sold) >= since:
            continue
        s = stock[item.pk]
        if not s["sellable"]:
            continue
        report.rows.append(
            {
                "code": item.code,
                "item": item.name_ar,
                "item_en": item.name_en,
                "on_hand": _in_units(s["sellable"], units[item.pk]),
                "last_sale": timezone.localdate(sold) if sold else None,
                "value": money(s["value"]),
            }
        )
        total += s["value"]
    report.totals = {"value": money(total)}
    return report


def receivables(p: Params) -> Report:
    from apps.purchasing.models import Supplier

    report = Report(
        "receivables",
        [
            Column("party", "الطرف", "Party"),
            Column("kind", "النوع", "Type"),
            Column("balance", "الرصيد", "Balance", "money"),
            Column("limit", "الحد الائتماني", "Credit limit", "money"),
            Column("last", "آخر حركة", "Last activity", "date"),
        ],
    )
    last = {
        (r["party_type"], r["party_id"]): r["last"]
        for r in PartyLedgerEntry.objects.values("party_type", "party_id").annotate(
            last=Max("created_at")
        )
    }
    owed = Decimal(0)
    for c in Customer.objects.filter(~Q(balance=0)).order_by("name_en"):
        stamp = last.get(("customer", c.pk))
        report.rows.append(
            {
                "party": c.name_ar,
                "party_en": c.name_en,
                "kind": "customer",
                "balance": c.balance,
                "limit": c.credit_limit,
                "last": timezone.localdate(stamp) if stamp else None,
            }
        )
        owed += c.balance
    payable = Decimal(0)
    for s in Supplier.objects.order_by("name_en"):
        balance = supplier_balance(s.pk)
        if not balance:
            continue
        stamp = last.get(("supplier", s.pk))
        report.rows.append(
            {
                "party": s.name_ar,
                "party_en": s.name_en,
                "kind": "supplier",
                "balance": balance,
                "limit": None,
                "last": timezone.localdate(stamp) if stamp else None,
            }
        )
        payable += balance
    report.totals = {"receivable": money(owed), "payable": money(payable)}
    return report


def shifts(p: Params) -> Report:
    from apps.sales.models import Shift
    from apps.sales.services.shifts import summary

    start, end = _span(p)
    report = Report(
        "shifts",
        [
            Column("number", "الوردية", "Shift", "number"),
            Column("counter", "الكاونتر", "Counter"),
            Column("opened", "الفتح", "Opened", "date"),
            Column("sales", "المبيعات", "Sales", "money"),
            Column("expected", "النقد المتوقع", "Expected cash", "money"),
            Column("counted", "المعدود", "Counted", "money"),
            Column("variance", "الفرق", "Variance", "money"),
        ],
    )
    rows = (
        Shift.objects.filter(branch=p.branch, opened_at__gte=start, opened_at__lt=end)
        .select_related("device")
        .order_by("-opened_at")
    )
    total_sales = Decimal(0)
    total_var = Decimal(0)
    for s in rows:
        info = summary(s)
        report.rows.append(
            {
                "number": s.number,
                "counter": s.device.name_ar,
                "counter_en": s.device.name_en,
                "opened": timezone.localdate(s.opened_at),
                "sales": info["sales_total"],
                "expected": s.expected_cash
                if s.expected_cash is not None
                else info["expected_cash"],
                "counted": s.counted_cash,
                "variance": s.variance,
            }
        )
        total_sales += info["sales_total"]
        total_var += s.variance or 0
    report.totals = {"sales": money(total_sales), "variance": money(total_var)}
    return report


REPORTS: dict[str, Callable[[Params], Report]] = {
    "gross_profit": gross_profit,
    "stock_value": stock_value,
    "expiry": expiry,
    "shortages": shortages,
    "slow_moving": slow_moving,
    "receivables": receivables,
    "shifts": shifts,
}

DEFAULT_DAYS = {"expiry": settings.RAFF_NEAR_EXPIRY_DAYS, "slow_moving": 60}
