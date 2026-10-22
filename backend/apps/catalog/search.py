"""Search normalisation for item names (Arabic and Latin).

Pharmacists type fast and loosely: "ادفانس" must find "أدفانس", "اسبرين" must
find "أسبرين", Arabic-Indic digits must match Western ones. The same function
produces the stored `search_normalized` column and normalises the query.
"""

from __future__ import annotations

import re
import unicodedata

_TASHKEEL = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭ]")
_TATWEEL = "ـ"
_MAP = str.maketrans(
    {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ة": "ه",
        "ى": "ي",
        "ؤ": "و",
        "ئ": "ي",
        "٠": "0",
        "١": "1",
        "٢": "2",
        "٣": "3",
        "٤": "4",
        "٥": "5",
        "٦": "6",
        "٧": "7",
        "٨": "8",
        "٩": "9",
        "۰": "0",
        "۱": "1",
        "۲": "2",
        "۳": "3",
        "۴": "4",
        "۵": "5",
        "۶": "6",
        "۷": "7",
        "۸": "8",
        "۹": "9",
    }
)
_SPACES = re.compile(r"[\s/·,;:()\[\]\-_]+")


def normalize(text: str) -> str:
    """Lower-case, strip diacritics and tatweel, unify hamza/ta marbuta/ya, Western digits."""
    text = unicodedata.normalize("NFKC", text).casefold()
    text = _TASHKEEL.sub("", text).replace(_TATWEEL, "")
    text = text.translate(_MAP)
    return _SPACES.sub(" ", text).strip()


def search_document(*parts: str | None) -> str:
    return " ".join(normalize(p) for p in parts if p)
