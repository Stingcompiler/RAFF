#!/usr/bin/env python3
"""Raff design tokens — the single source of the colors in frontend/src/styles/tokens.css.

Values come from docs/design/Design-Reference-v2.2.md (§1, §10, appendix A) with the
Raff decisions in docs/design/DECISIONS.md applied:
  D-R0001  brand is Raff green
  D-R0007  border-strong reaches 3:1 on every surface (field borders)
  D-R0010  chart-2 and chart-5 move away from the brand hue

Usage (from the repository root):
  python3 design/system/build_tokens.py           write the file
  python3 design/system/build_tokens.py --check   fail if the file is out of date
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "frontend" / "src" / "styles" / "tokens.css"

# name: (light, dark). Semantic names; components never carry a hex.
COLORS = {
    "canvas": ("#F6F7F9", "#0B1220"),
    "surface": ("#FFFFFF", "#111A2B"),
    "surface-subtle": ("#F1F5F9", "#172238"),
    "surface-raised": ("#FFFFFF", "#1A2539"),
    "border": ("#E2E8F0", "#243049"),
    "border-strong": ("#7B8FA9", "#51709E"),
    "text": ("#0F172A", "#E6EAF2"),
    "text-secondary": ("#475569", "#A7B1C2"),
    "text-muted": ("#5D6B80", "#7E8AA0"),
    "text-disabled": ("#94A3B8", "#55617A"),
    "brand": ("#245C4F", "#5FA58F"),
    "brand-hover": ("#1A4239", "#79B4A1"),
    "brand-subtle": ("#E7F1ED", "#173128"),
    "on-brand": ("#FFFFFF", "#0B1220"),
    "selection-bg": ("#E7F1ED", "#173128"),
    "selection-border": ("#245C4F", "#5FA58F"),
    "focus": ("#2563EB", "#60A5FA"),
    "success-text": ("#166534", "#86EFAC"),
    "success-bg": ("#ECFDF5", "#0F2A1E"),
    "success-border": ("#A7F3D0", "#1F5A3A"),
    "success-solid": ("#16A34A", "#22C55E"),
    "warning-text": ("#92400E", "#FCD34D"),
    "warning-bg": ("#FFFBEB", "#2E2208"),
    "warning-border": ("#FDE68A", "#6B4E0E"),
    "warning-solid": ("#D97706", "#F59E0B"),
    "danger-text": ("#991B1B", "#FCA5A5"),
    "danger-bg": ("#FEF2F2", "#331418"),
    "danger-border": ("#FECACA", "#7A2A30"),
    "danger-solid": ("#DC2626", "#EF4444"),
    "info-text": ("#1D4ED8", "#93C5FD"),
    "info-bg": ("#EFF6FF", "#0F2340"),
    "info-border": ("#BFDBFE", "#1E4A7A"),
    "info-solid": ("#2563EB", "#3B82F6"),
    "pending-text": ("#3F3F46", "#C9CDD6"),
    "pending-bg": ("#F4F4F5", "#1C2333"),
    "pending-border": ("#D4D4D8", "#364258"),
    "chart-1": ("#245C4F", "#5FA58F"),
    "chart-2": ("#2563EB", "#60A5FA"),
    "chart-3": ("#7C3AED", "#C084FC"),
    "chart-4": ("#BE185D", "#F472B6"),
    "chart-5": ("#64748B", "#94A3B8"),
    "scrim": ("#0F172A", "#000000"),
}

# Raff's own, theme-independent: the receipt is always light; the camera frame is always dark.
STATIC_COLORS = {
    "receipt-paper": "#FFFFFF",
    "receipt-ink": "#111111",
    "camera": "#10201B",
    "camera-ink": "#DCEB9D",
}

# Shadows (v2.2 shadow-1/2/3 per theme) and Raff's elevations built on them.
SHADOWS = {
    "light": {
        "1": "0 1px 2px rgba(15, 23, 42, 0.06)",
        "2": "0 4px 12px rgba(15, 23, 42, 0.08)",
        "3": "0 12px 32px rgba(15, 23, 42, 0.14)",
    },
    "dark": {
        "1": "0 1px 2px rgba(0, 0, 0, 0.4)",
        "2": "0 4px 12px rgba(0, 0, 0, 0.45)",
        "3": "0 12px 32px rgba(0, 0, 0, 0.6)",
    },
}
STATIC_SHADOWS = {
    "drawer": "-12px 0 40px rgba(15, 23, 42, 0.18)",
    "receipt": "0 10px 30px rgba(0, 0, 0, 0.18)",
    "scan": "0 0 12px 2px rgba(220, 235, 157, 0.7)",
    "sheet": "0 -10px 30px rgba(15, 23, 42, 0.14)",
}

# Shape, motion and density (v2.2 §3, §4, §5). Not colors, but generated from one source.
RADII = {"control": 8, "card": 14, "panel": 16, "pill": 999}
MOTION = {  # name: milliseconds
    "feedback": 100,
    "popover-in": 140,
    "popover-out": 100,
    "panel-in": 220,
    "panel-out": 160,
    "scene": 160,
}
EASE = {"standard": "cubic-bezier(0.2, 0, 0, 1)", "exit": "cubic-bezier(0.4, 0, 1, 1)"}
# mode: (row, pad, gap, card pad, font). Chosen app-wide in settings (D-R0003).
DENSITY = {
    "compact": (32, 8, 8, 12, 13),
    "default": (40, 16, 16, 20, 14),
    "comfortable": (48, 20, 24, 24, 15),
}
SCRIM_ALPHA = ("45%", "60%")  # light, dark
# role: (size px, weight, line height) — v2.2 §2. Used as `type-<role>` utilities.
TYPE = {
    "caption": (12, 400, 1.6),
    "body": (14, 400, 1.6),
    "body-large": (16, 400, 1.6),
    "label": (13, 600, 1.4),
    "section": (20, 700, 1.3),
    "page": (28, 700, 1.25),
    "metric": (32, 700, 1.1),
    "total": (36, 700, 1.1),
}

# The named size scale (font-size, line height): the only sizes components may use, as
# `text-<name>`. Plex Sans has no lower limit than 12px/400 with a line of 1.6 or more.
SCALE = {
    "caption": (12, 1.6),
    "label": (13, 1.4),
    "body": (14, 1.6),
    "lead": (16, 1.6),
    "section": (20, 1.3),
    "page": (28, 1.25),
    "metric": (32, 1.1),
    "total": (36, 1.1),
}
# Landing and storefront sizes (LANDING.md §7): desktop, phone, line height.
LANDING_SCALE = {
    "land-hero": (52, 30, 1.2),
    "land-hero-lead": (18, 15, 1.7),
    "land-section": (32, 24, 1.25),
    "land-lead": (17, 15, 1.6),
    "land-feature": (24, 20, 1.3),
    "land-body": (16, 15, 1.7),
}
LEADING = {"tight": 1.25, "snug": 1.4, "body": 1.6, "loose": 1.7}
UI_STACK = '"IBM Plex Sans Arabic", "IBM Plex Sans", system-ui, sans-serif'
UI_STACK_EN = '"IBM Plex Sans", "IBM Plex Sans Arabic", system-ui, sans-serif'

HEADER = """/*
 * GENERATED by design/system/build_tokens.py — do not edit by hand (`make tokens`).
 * Source: docs/design/Design-Reference-v2.2.md with the Raff decisions in
 * docs/design/DECISIONS.md. This is the only file allowed to contain color values.
 */"""


def density_vars(mode: str) -> list[str]:
    row, pad, gap, card, font = DENSITY[mode]
    return [
        f"  --d-row: {row}px;",
        f"  --d-pad: {pad}px;",
        f"  --d-gap: {gap}px;",
        f"  --d-card-pad: {card}px;",
        f"  --d-font: {font}px;",
    ]


def theme_block(selector: str, index: int, scheme: str, shadows: dict) -> str:
    lines = [f"{selector} {{", f"  color-scheme: {scheme};"]
    lines += [f"  --c-{name}: {pair[index].lower()};" for name, pair in COLORS.items()]
    lines.append(f"  --scrim-alpha: {SCRIM_ALPHA[index]};")
    lines += [f"  --elev-{key}: {value};" for key, value in shadows.items()]
    lines.append("}")
    return "\n".join(lines)


def build() -> str:
    parts = [HEADER]
    parts.append(theme_block(':root,\n[data-theme="light"]', 0, "light", SHADOWS["light"]))
    parts.append(theme_block('[data-theme="dark"]', 1, "dark", SHADOWS["dark"]))

    static = [":root {"]
    static += [f"  --c-{name}: {value.lower()};" for name, value in STATIC_COLORS.items()]
    static += [f"  --elev-{name}: {value};" for name, value in STATIC_SHADOWS.items()]
    static += [f"  --motion-{name}: {ms}ms;" for name, ms in MOTION.items()]
    static += [f"  --ease-{name}: {curve};" for name, curve in EASE.items()]
    static += density_vars("default")
    static += [f"  --land-{name.removeprefix('land-')}: {desk}px;" for name, (desk, _, _) in LANDING_SCALE.items()]
    # One family decision (D-R0014, option A): Plex Sans Arabic + Plex Sans. The three
    # variables exist so a brand with its own fonts changes them in one place.
    static += [
        f"  --font-ui: {UI_STACK};",
        "  --font-mono: var(--font-ui);",
        "  --font-display: var(--font-ui);",
    ]
    static.append("}")
    parts.append("\n".join(static))
    # English text reads Latin-first; the stack is the same two families (after :root, so it wins).
    parts.append(f":lang(en) {{\n  --font-ui: {UI_STACK_EN};\n}}")

    # A scope picks a density with data-density="compact|default|comfortable".
    for mode in ("compact", "default", "comfortable"):
        parts.append("\n".join([f'[data-density="{mode}"] {{', *density_vars(mode), "}"]))
    # Phones read comfortable unless this device picked a density (data-density sets it).
    phone = "\n".join(f"  {line}" for line in density_vars("comfortable"))
    parts.append(f"@media (max-width: 760px) {{\n  :root:not([data-density]) {{\n{phone}\n  }}\n}}")
    # v2.2 §4: reduced motion zeroes every duration.
    zero = "\n".join(f"    --motion-{name}: 0ms;" for name in MOTION)
    parts.append(f"@media (prefers-reduced-motion: reduce) {{\n  :root {{\n{zero}\n  }}\n}}")
    for role, (size, weight, leading) in TYPE.items():
        parts.append(
            f"@utility type-{role} {{\n  font-size: {size}px;\n  font-weight: {weight};\n"
            f"  line-height: {leading};\n}}"
        )
    # The family variables are plain custom properties; these utilities read them.
    parts.append("@utility font-ui {\n  font-family: var(--font-ui);\n}")
    parts.append("@utility font-display {\n  font-family: var(--font-display);\n}")
    # Numbers, dates, times, ids, phones and codes (v2.3 §2): tabular, left to right, isolated.
    parts.append(
        "@utility num {\n  font-family: var(--font-mono, var(--font-ui));\n"
        "  font-variant-numeric: tabular-nums;\n  direction: ltr;\n  unicode-bidi: isolate;\n}"
    )
    # On phones the landing sizes step down.
    phone_land = "\n".join(
        f"    --land-{name.removeprefix('land-')}: {phone}px;" for name, (_, phone, _) in LANDING_SCALE.items()
    )
    parts.append(f"@media (max-width: 760px) {{\n  :root {{\n{phone_land}\n  }}\n}}")
    # A control smaller than 44px keeps its look but gets a 44px hit area (CLAUDE.md rule 14).
    parts.append(
        "@utility hit-44 {\n  position: relative;\n  &::after {\n    content: \"\";\n"
        "    position: absolute;\n"
        "    inset-block: min(0px, calc((100% - 44px) / 2));\n"
        "    inset-inline: min(0px, calc((100% - 44px) / 2));\n  }\n}"
    )
    # The dim layer behind dialogs and drawers: one color, an alpha that depends on the theme.
    parts.append(
        "@utility bg-veil {\n"
        "  background-color: color-mix(in oklab, var(--c-scrim) var(--scrim-alpha), transparent);\n"
        "}"
    )

    theme = ["@theme inline {", "  /* Drop Tailwind's default palette: only the tokens below exist as colors. */", "  --color-*: initial;"]
    theme += [f"  --color-{name}: var(--c-{name});" for name in COLORS]
    theme += [f"  --color-{name}: var(--c-{name});" for name in STATIC_COLORS]
    theme += ["  --color-transparent: transparent;", "  --color-current: currentColor;", ""]
    theme += [f"  --radius-{name}: {px}px;" for name, px in RADII.items()]
    theme += [""]
    theme += [f"  --shadow-{n}: var(--elev-{n});" for n in ("1", "2", "3")]
    theme += [f"  --shadow-{n}: var(--elev-{n});" for n in STATIC_SHADOWS]
    # Names the components already use, now defined from the v2.2 shadows.
    theme += [
        "  --shadow-dialog: var(--elev-3);",
        "  --shadow-tile: var(--elev-2);",
        "  --shadow-segment: var(--elev-1);",
        "",
        "  /* Only the named scale exists as font sizes and line heights. */",
        "  --text-*: initial;",
        "  --leading-*: initial;",
    ]
    theme += [f"  --text-{n}: {px}px;\n  --text-{n}--line-height: {lh};" for n, (px, lh) in SCALE.items()]
    theme += [
        f"  --text-{n}: var(--land-{n.removeprefix('land-')});\n  --text-{n}--line-height: {lh};"
        for n, (_, _, lh) in LANDING_SCALE.items()
    ]
    theme += [f"  --leading-{n}: {v};" for n, v in LEADING.items()]
    theme += ["  --leading-none: 1;", "}"]
    parts.append("\n".join(theme))
    return "\n\n".join(parts) + "\n"


if __name__ == "__main__":
    text = build()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != text:
            print("tokens.css is out of date: run `make tokens`", file=sys.stderr)
            sys.exit(1)
        print("tokens.css is up to date")
    else:
        OUT.write_text(text)
        print(f"wrote {OUT.relative_to(ROOT)}")
