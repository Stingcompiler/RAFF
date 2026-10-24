// ESLint plugin enforcing CLAUDE.md rules 11 (token colors) and 12 (logical properties).
import {
  findLegacyToken,
  findPhysicalClass,
  findPhysicalInCssText,
  findRawFont,
  findRawColorInText,
  PHYSICAL_PROPERTIES_CAMEL,
  PHYSICAL_VALUE_PROPERTIES_CAMEL,
  PHYSICAL_VALUES,
  RAW_FONT_STYLE_PROPS,
} from "./patterns.mjs";

const LOOKS_LIKE_CSS = /[a-z-]+\s*:\s*[^;]+;/i;

/** Yield [node, text] for every string literal and template chunk in the file. */
function stringVisitors(check) {
  return {
    Literal(node) {
      if (typeof node.value === "string") check(node, node.value);
    },
    TemplateElement(node) {
      check(node, node.value.cooked ?? node.value.raw);
    },
    JSXText(node) {
      check(node, node.value);
    },
  };
}

function propertyName(prop) {
  if (prop.type !== "Property" || prop.computed) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal" && typeof prop.key.value === "string") return prop.key.value;
  return null;
}

function staticString(node) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? "";
  }
  return null;
}

const noRawColor = {
  meta: {
    type: "problem",
    docs: { description: "Colors only via design tokens (src/styles/tokens.css)." },
    schema: [],
    messages: {
      raw: "Raw color ({{what}}). Use a design token utility (bg-surface, text-ink, …).",
    },
  },
  create(context) {
    return stringVisitors((node, text) => {
      const what = findRawColorInText(text);
      if (what) context.report({ node, messageId: "raw", data: { what } });
    });
  },
};

const noRawFont = {
  meta: {
    type: "problem",
    docs: { description: "Type only through the named scale (text-body, leading-body, font-ui…)." },
    schema: [],
    messages: {
      raw: 'Raw type value "{{what}}". Use the named scale: text-caption|label|body|lead|section|page|metric|total (land-* on the storefront), leading-tight|snug|body|loose, font-medium|semibold|bold, num for numbers.',
      style: 'Type value in style ("{{what}}"). Use the named scale classes.',
    },
  },
  create(context) {
    return {
      ...stringVisitors((node, text) => {
        const what = findRawFont(text);
        if (what) context.report({ node, messageId: "raw", data: { what } });
      }),
      "JSXAttribute[name.name='style'] ObjectExpression > Property"(prop) {
        const name = propertyName(prop);
        if (name && RAW_FONT_STYLE_PROPS.has(name)) {
          const value = staticString(prop.value);
          if (value === "inherit") return;
          context.report({ node: prop.key, messageId: "style", data: { what: name } });
        }
      },
    };
  },
};

const noLegacyToken = {
  meta: {
    type: "problem",
    docs: { description: "Color tokens use the v2.2 names (canvas, text, border, brand, …)." },
    schema: [],
    messages: {
      legacy:
        'Legacy color token "{{what}}" (removed in WO-15). See docs/design/Design-Reference-v2.2.md §1: text-text, bg-canvas, border-border, bg-brand, …',
    },
  },
  create(context) {
    return stringVisitors((node, text) => {
      const what = findLegacyToken(text);
      if (what) context.report({ node, messageId: "legacy", data: { what } });
    });
  },
};

const noPhysicalProperties = {
  meta: {
    type: "problem",
    docs: { description: "Logical CSS properties only (ps-*, ms-*, text-start, border-s…)." },
    schema: [],
    messages: {
      cls: 'Physical utility "{{what}}". Use the logical form (ms-/me-/ps-/pe-/start-/end-/text-start/border-s/rounded-s).',
      css: 'Physical CSS "{{what}}". Use the logical property (margin-inline-start, inset-inline-start, text-align: start…).',
    },
  },
  create(context) {
    const strings = stringVisitors((node, text) => {
      const cls = findPhysicalClass(text);
      if (cls) {
        context.report({ node, messageId: "cls", data: { what: cls } });
        return;
      }
      if (LOOKS_LIKE_CSS.test(text)) {
        const css = findPhysicalInCssText(text);
        if (css) context.report({ node, messageId: "css", data: { what: css } });
      }
    });
    return {
      ...strings,
      // style={{ marginLeft: 4, textAlign: "left" }}
      "JSXAttribute[name.name='style'] ObjectExpression > Property"(prop) {
        const name = propertyName(prop);
        if (!name) return;
        if (PHYSICAL_PROPERTIES_CAMEL.has(name)) {
          context.report({ node: prop.key, messageId: "css", data: { what: name } });
          return;
        }
        const value = staticString(prop.value);
        if (
          PHYSICAL_VALUE_PROPERTIES_CAMEL.has(name) &&
          value !== null &&
          PHYSICAL_VALUES.has(value.trim().toLowerCase())
        ) {
          context.report({ node: prop, messageId: "css", data: { what: `${name}: ${value}` } });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: "eslint-plugin-raff" },
  rules: {
    "no-raw-color": noRawColor,
    "no-physical-properties": noPhysicalProperties,
    "no-legacy-token": noLegacyToken,
    "no-raw-font": noRawFont,
  },
};

export default plugin;
