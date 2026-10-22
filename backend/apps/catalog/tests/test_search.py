from __future__ import annotations

import pytest

from apps.catalog.search import normalize


@pytest.mark.parametrize(
    ("typed", "stored"),
    [
        ("ادفانس", "أدفانس"),
        ("اسبرين", "أسبرين"),
        ("امبيسلين", "إمبيسلين"),
        ("فيتامين سي", "فيتامين سى"),
        ("حبه", "حبة"),
        ("شراب", "شَرَاب"),
        ("بنادول", "بنـــادول"),
        ("500", "٥٠٠"),
        ("augmentin 625", "Augmentin/625"),
    ],
)
def test_normalized_forms_match(typed: str, stored: str) -> None:
    assert normalize(typed) == normalize(stored)
