// Stylelint plugins enforcing CLAUDE.md rules 11 (token colors) and 12 (logical properties).
import stylelint from "stylelint";

import {
  COLOR_FUNCTION,
  CSS_NAMED_COLORS,
  findPhysicalClass,
  findRawColorInText,
  HEX_COLOR,
  PHYSICAL_PROPERTIES,
  PHYSICAL_VALUE_PROPERTIES,
  PHYSICAL_VALUES,
} from "./patterns.mjs";

const {
  createPlugin,
  utils: { report, ruleMessages },
} = stylelint;

/** Remove var(), url() and quoted strings so their contents are not mistaken for colors. */
function stripNonColorParts(value) {
  return value
    .replace(/url\([^)]*\)/gi, "")
    .replace(/"[^"]*"|'[^']*'/g, "")
    .replace(/var\(\s*--[\w-]+/gi, "var(");
}

function rawColorInValue(value) {
  const v = stripNonColorParts(value);
  const hex = HEX_COLOR.exec(v);
  if (hex) return `hex color "${hex[0]}"`;
  const fn = COLOR_FUNCTION.exec(v);
  if (fn) return `color function "${fn[0]}…)"`;
  for (const word of v.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? []) {
    if (CSS_NAMED_COLORS.has(word)) return `named color "${word}"`;
  }
  return null;
}

const colorRule = "raff/no-raw-color";
const colorMessages = ruleMessages(colorRule, {
  raw: (what) => `Raw ${what}. Colors live only in src/styles/tokens.css.`,
});

const noRawColor = createPlugin(colorRule, (enabled) => (root, result) => {
  if (!enabled) return;
  root.walkDecls((decl) => {
    const what = rawColorInValue(decl.value);
    if (what) report({ ruleName: colorRule, result, node: decl, message: colorMessages.raw(what) });
  });
  root.walkAtRules("apply", (rule) => {
    const what = findRawColorInText(rule.params);
    if (what) report({ ruleName: colorRule, result, node: rule, message: colorMessages.raw(what) });
  });
});

const physicalRule = "raff/no-physical-properties";
const physicalMessages = ruleMessages(physicalRule, {
  prop: (p) =>
    `Physical property "${p}". Use the logical form (margin-inline-start, inset-inline-end, border-inline-start…).`,
  value: (p, v) => `"${p}: ${v}" is physical. Use start/end.`,
  cls: (c) => `Physical utility "${c}" in @apply. Use the logical form.`,
});

const noPhysicalProperties = createPlugin(physicalRule, (enabled) => (root, result) => {
  if (!enabled) return;
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (PHYSICAL_PROPERTIES.has(prop)) {
      report({ ruleName: physicalRule, result, node: decl, message: physicalMessages.prop(prop) });
    } else if (
      PHYSICAL_VALUE_PROPERTIES.has(prop) &&
      PHYSICAL_VALUES.has(decl.value.trim().toLowerCase())
    ) {
      report({
        ruleName: physicalRule,
        result,
        node: decl,
        message: physicalMessages.value(prop, decl.value.trim()),
      });
    }
  });
  root.walkAtRules("apply", (rule) => {
    const cls = findPhysicalClass(rule.params);
    if (cls)
      report({ ruleName: physicalRule, result, node: rule, message: physicalMessages.cls(cls) });
  });
});

const plugins = [noRawColor, noPhysicalProperties];

export default plugins;
