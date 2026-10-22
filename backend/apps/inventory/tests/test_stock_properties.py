"""Property: after any sequence of movements, the balance equals the sum of the log and
never goes negative; a movement that would go negative is refused and changes nothing."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.inventory.models import Batch, Location, StockBalance, StockMovement
from apps.inventory.services.stock import InsufficientStock, Move, apply_movements, location
from apps.tenancy.context import org_context
from tests.factories import World
from tests.stock import boxed_item

ZERO = Decimal(0)


@settings(
    max_examples=40, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    deltas=st.lists(st.integers(min_value=-50, max_value=50).filter(bool), min_size=1, max_size=25)
)
def test_balance_is_sum_of_movements(world: World, deltas: list[int]) -> None:
    with org_context(world.org.id), transaction.atomic():
        item = boxed_item(code=f"P{abs(hash(tuple(deltas))) % 10**8}")
        batch = Batch.objects.create(item=item, batch_no="B", unit_cost=ZERO)
        shelf = location(world.khartoum, Location.Kind.SELLABLE)
        expected = 0
        for delta in deltas:
            try:
                with transaction.atomic():
                    apply_movements(
                        world.khartoum,
                        [Move(shelf, batch, delta, ZERO)],
                        kind=StockMovement.Kind.ADJUSTMENT,
                        document_type="test",
                        document_id=batch.pk,
                        user=None,
                    )
                expected += delta
            except InsufficientStock:
                assert expected + delta < 0
            row = StockBalance.objects.filter(location=shelf, batch=batch).first()
            balance = row.quantity_base if row else 0  # a refused first movement leaves no row
            log = sum(
                StockMovement.objects.filter(batch=batch).values_list("quantity_base", flat=True)
            )
            assert balance == log == expected >= 0
        transaction.set_rollback(True)
