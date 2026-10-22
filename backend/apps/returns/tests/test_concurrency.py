"""Returns under real concurrency: two connections (CLAUDE.md rule 22)."""

from __future__ import annotations

import pytest

from apps.inventory.tests.test_concurrency import race
from apps.returns.models import SaleReturn
from apps.returns.services.posting import ReturnError
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import stocked, with_shift

from .helpers import give_back, sell

pytestmark = pytest.mark.django_db(transaction=True)


def test_two_counters_cannot_return_the_last_box_twice(world: World) -> None:
    with org_context(world.org.id):
        item = stocked(world, boxes=2)
        with_shift(world)
        sale = sell(world, item, boxes=1)

    def back(_: int) -> object:
        with org_context(world.org.id):
            return give_back(world, sale, 1)

    results = race(back)
    assert sum(isinstance(r, dict) for r in results) == 1
    assert sum(isinstance(r, ReturnError) and r.code == "exceeds_sold" for r in results) == 1
    with org_context(world.org.id):
        assert SaleReturn.objects.count() == 1
