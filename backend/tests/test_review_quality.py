"""WO-36: review B-08 (one query for many prices) and B-09 (documented error answers)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.catalog.models import Item
from apps.storefront.selectors import current_prices
from apps.tenancy.context import org_context
from tests.factories import World
from tests.selling import stocked

pytestmark = pytest.mark.django_db


def test_b08_prices_cost_the_same_queries_for_3_or_12_items(world: World) -> None:
    def queries(n: int) -> int:
        with org_context(world.org.id):
            for i in range(n):
                stocked(world, code=f"B08-{n}-{i}", boxes=1)
            items = list(
                Item.objects.filter(code__startswith=f"B08-{n}-").prefetch_related("units")
            )
            with CaptureQueriesContext(connection) as ctx:
                prices = current_prices(items)
            assert len(prices) == n
            return len(ctx.captured_queries)

    assert queries(3) == queries(12)


def test_b09_posting_operations_document_refusal_and_key_conflict() -> None:
    schema: dict[str, Any] = yaml.safe_load(
        (Path(__file__).resolve().parents[1] / "openapi" / "schema.yaml").read_text()
    )
    assert "Error" in schema["components"]["schemas"]
    sale = schema["paths"]["/api/v1/sales/"]["post"]["responses"]
    assert {"201", "400", "409"} <= set(sale)
    public = schema["paths"]["/api/v1/public/orders/"]["post"]["responses"]
    assert "429" in public
