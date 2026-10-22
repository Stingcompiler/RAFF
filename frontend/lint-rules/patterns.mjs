// Shared detection for the two Raff lint rules (ESLint + Stylelint).
// CLAUDE.md rule 11: colors only via tokens. Rule 12: logical properties only.

export const CSS_NAMED_COLORS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
    "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
    "crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
    "darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
    "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
    "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
    "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
    "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
    "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
    "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);

const TW_PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|" +
  "blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe";
const TW_COLOR_UTILITIES =
  "bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|from|via|to|" +
  "decoration|divide|placeholder|caret|accent|shadow|inset-shadow|drop-shadow|text-shadow";

export const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/;
export const COLOR_FUNCTION = /(?<![-\w])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const TW_PALETTE_CLASS = new RegExp(
  `^-?(?:${TW_COLOR_UTILITIES})-(?:(?:${TW_PALETTE})-\\d{2,3}|black|white)(?:/\\d+)?$`,
);
const TW_ARBITRARY_COLOR = /-\[(?:#|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\()/i;

// Physical Tailwind utilities and their logical replacements.
const TW_PHYSICAL_CLASS = [
  /^-?(?:m|p|scroll-m|scroll-p)[lr]-/, // ml-*, pr-* → ms-*, pe-*
  /^-?(?:left|right)-/, // left-0 → start-0 / inset-inline-*
  /^(?:text|float|clear)-(?:left|right)$/, // text-left → text-start
  /^border-[lr](?:-|$)/, // border-l → border-s
  /^rounded-(?:l|r|tl|tr|bl|br)(?:-|$)/, // rounded-l → rounded-s
];

/** Strip Tailwind variants (`md:hover:`) and the important marker. */
function baseClass(token) {
  const parts = token.split(":");
  return parts[parts.length - 1].replace(/^!/, "").replace(/!$/, "");
}

export function classTokens(text) {
  return text.split(/\s+/).filter(Boolean).map(baseClass);
}

/** Return a description of the first raw color found in free text, or null. */
export function findRawColorInText(text) {
  const trimmed = text.trim();
  if (CSS_NAMED_COLORS.has(trimmed.toLowerCase())) return `named color "${trimmed}"`;
  const fn = COLOR_FUNCTION.exec(text);
  if (fn) return `color function "${fn[0]}…)"`;
  const hexWhole = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed);
  if (hexWhole) return `hex color "${trimmed}"`;
  const cssHex = /(?:^|[;{\s])[a-z-]+\s*:\s*[^;]*#(?:[0-9a-fA-F]{3,8})(?![0-9a-zA-Z])/i.exec(text);
  if (cssHex) return `hex color in "${cssHex[0].trim()}"`;
  for (const token of classTokens(text)) {
    if (TW_PALETTE_CLASS.test(token)) return `palette class "${token}"`;
    if (TW_ARBITRARY_COLOR.test(token)) return `arbitrary color class "${token}"`;
  }
  return null;
}

/** Return the first physical Tailwind class in a class string, or null. */
export function findPhysicalClass(text) {
  for (const token of classTokens(text)) {
    if (TW_PHYSICAL_CLASS.some((re) => re.test(token))) return token;
  }
  return null;
}

// Physical CSS properties (kebab-case); camelCase is derived for JS style objects.
export const PHYSICAL_PROPERTIES = new Set([
  "left",
  "right",
  "margin-left",
  "margin-right",
  "padding-left",
  "padding-right",
  "border-left",
  "border-right",
  "border-left-width",
  "border-right-width",
  "border-left-color",
  "border-right-color",
  "border-left-style",
  "border-right-style",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "scroll-margin-left",
  "scroll-margin-right",
  "scroll-padding-left",
  "scroll-padding-right",
]);
export const PHYSICAL_VALUE_PROPERTIES = new Set(["text-align", "float", "clear"]);
export const PHYSICAL_VALUES = new Set(["left", "right"]);

export function kebabToCamel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export const PHYSICAL_PROPERTIES_CAMEL = new Set([...PHYSICAL_PROPERTIES].map(kebabToCamel));
export const PHYSICAL_VALUE_PROPERTIES_CAMEL = new Set(
  [...PHYSICAL_VALUE_PROPERTIES].map(kebabToCamel),
);

/** Physical declarations written inside a CSS string, e.g. "margin-left: 4px". */
export function findPhysicalInCssText(text) {
  const decl = /(?:^|[;{\s"'`])([a-z-]+)\s*:\s*([^;}"'`]*)/gi;
  for (const [, prop, value] of text.matchAll(decl)) {
    const p = prop.toLowerCase();
    if (PHYSICAL_PROPERTIES.has(p)) return `${p}`;
    if (PHYSICAL_VALUE_PROPERTIES.has(p) && PHYSICAL_VALUES.has(value.trim().toLowerCase())) {
      return `${p}: ${value.trim()}`;
    }
  }
  return null;
}
