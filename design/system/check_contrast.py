#!/usr/bin/env python3
"""WCAG 2.x contrast for the pairs that matter, in both themes (`make contrast`).

Text and status badges need 4.5:1; focus ring, field borders and chart series need 3:1.
Chart series must also stay ≥40° of hue away from the brand so they are not read as it.
Exits 1 on any failure.
"""

import colorsys
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_tokens import COLORS  # noqa: E402


def rgb(hex_value: str):
    h = hex_value.lstrip("#")
    return [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]


def luminance(hex_value: str) -> float:
    def channel(x):
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(x) for x in rgb(hex_value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a: str, b: str) -> float:
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def hue(hex_value: str) -> float:
    return colorsys.rgb_to_hls(*rgb(hex_value))[0] * 360


def hue_gap(a: str, b: str) -> float:
    d = abs(hue(a) - hue(b))
    return min(d, 360 - d)


TEXT, UI = 4.5, 3.0
PAIRS = [
    ("text", "canvas", TEXT), ("text", "surface", TEXT), ("text", "surface-subtle", TEXT),
    ("text-secondary", "surface", TEXT), ("text-secondary", "canvas", TEXT),
    ("text-secondary", "surface-subtle", TEXT),
    ("text-muted", "surface", TEXT), ("text-muted", "canvas", TEXT), ("text-muted", "surface-subtle", TEXT),
    ("on-brand", "brand", TEXT), ("on-brand", "brand-hover", TEXT), ("on-brand", "danger-solid", TEXT),
    ("brand", "surface", TEXT), ("brand", "canvas", TEXT), ("brand", "brand-subtle", TEXT),
    ("brand", "selection-bg", TEXT), ("text", "selection-bg", TEXT),
    ("success-text", "success-bg", TEXT), ("warning-text", "warning-bg", TEXT),
    ("danger-text", "danger-bg", TEXT), ("info-text", "info-bg", TEXT),
    ("pending-text", "pending-bg", TEXT),
    ("success-text", "surface", TEXT), ("warning-text", "surface", TEXT),
    ("danger-text", "surface", TEXT), ("info-text", "surface", TEXT),
    ("focus", "surface", UI), ("focus", "canvas", UI), ("focus", "surface-raised", UI),
    ("focus", "surface-subtle", UI),
    ("border-strong", "surface", UI), ("border-strong", "canvas", UI),
    ("border-strong", "surface-subtle", UI), ("border-strong", "surface-raised", UI),
    ("selection-border", "selection-bg", UI),
    ("chart-1", "surface", UI), ("chart-2", "surface", UI), ("chart-3", "surface", UI),
    ("chart-4", "surface", UI), ("chart-5", "surface", UI),
]
MIN_BRAND_HUE_GAP = 40


def main() -> int:
    failures = 0
    for index, theme in enumerate(("light", "dark")):
        c = {name: pair[index] for name, pair in COLORS.items()}
        print(f"\n== {theme} ==")
        for fg, bg, minimum in PAIRS:
            r = ratio(c[fg], c[bg])
            ok = r >= minimum
            failures += not ok
            print(f"{'✓' if ok else '✗'} {r:5.2f}:1 (≥{minimum}) {fg} / {bg}")
        for n in (2, 3, 4, 5):
            gap = hue_gap(c[f"chart-{n}"], c["brand"])
            # A neutral series (low saturation) has no hue to confuse with the brand.
            sat = colorsys.rgb_to_hls(*rgb(c[f"chart-{n}"]))[2]
            ok = gap >= MIN_BRAND_HUE_GAP or sat < 0.25
            failures += not ok
            print(f"{'✓' if ok else '✗'} chart-{n} is {gap:.0f}° from the brand hue (≥{MIN_BRAND_HUE_GAP}° or neutral)")
    print("\nall pairs pass" if not failures else f"\n{failures} failing")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
