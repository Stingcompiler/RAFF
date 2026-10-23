#!/usr/bin/env node
// One-shot (WO-15a): renames the old Raff color utilities and CSS variables to the v2.2 names.
//   node design/system/codemod-tokens.mjs          rewrite frontend/src in place
//   node design/system/codemod-tokens.mjs --dry    only report what would change
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../frontend/src");
const SKIP = new Set([path.join(ROOT, "styles/tokens.css")]);

// Old name -> new name, for every utility prefix.
const GENERIC = {
  bg: "canvas",
  sidebar: "surface-subtle",
  ink: "text",
  muted: "text-muted",
  line: "border",
  "line-strong": "border-strong",
  primary: "brand",
  "primary-ink": "on-brand",
  brand: "brand",
  "brand-ink": "on-brand",
  accent: "brand-subtle",
  "ink-soft": "text-secondary",
  "placeholder-bg": "surface-subtle",
  "placeholder-ink": "text-muted",
  canvas: "surface-subtle",
  surface: "surface",
  "surface-raised": "surface-subtle",
};
const STATUS = { success: "success", warn: "warning", danger: "danger", info: "info" };
const TEXT_LIKE = new Set(["text", "placeholder", "caret", "decoration"]);

function renameName(prefix, name) {
  if (name in GENERIC) return GENERIC[name];
  const base = name.replace(/-bg$/, "");
  if (base in STATUS) {
    if (name.endsWith("-bg")) return `${STATUS[base]}-bg`;
    return `${STATUS[base]}-${TEXT_LIKE.has(prefix) ? "text" : "solid"}`;
  }
  return name;
}

const NAMES = [...Object.keys(GENERIC), ...Object.keys(STATUS), ...Object.keys(STATUS).map((n) => `${n}-bg`)]
  .sort((a, b) => b.length - a.length)
  .join("|");
const PREFIXES =
  "border-[xytrblse]|border|bg|text|ring-offset|ring|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent";
const CLASS_RE = new RegExp(
  `(?<=^|[\\s"'\`:{(])(${PREFIXES})-(${NAMES})(\\/\\d+)?(?=$|[\\s"'\`/}):,\\]])`,
  "g",
);
const VAR_RE = new RegExp(`var\\(--color-(${NAMES})\\)`, "g");

let changed = 0;
function transform(text) {
  const a = text.replace(CLASS_RE, (m, prefix, name, alpha = "") => {
    const next = renameName(prefix.startsWith("border") ? "border" : prefix, name);
    return `${prefix}-${next}${alpha}`;
  });
  return a.replace(VAR_RE, (m, name) => `var(--color-${renameName("var", name)})`);
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) walk(file);
    else if (/\.(tsx|ts|css)$/.test(file) && !SKIP.has(file)) {
      const before = readFileSync(file, "utf8");
      const after = transform(before);
      if (after !== before) {
        changed++;
        if (!process.argv.includes("--dry")) writeFileSync(file, after);
        else console.log("would change", path.relative(ROOT, file));
      }
    }
  }
}
walk(ROOT);
console.log(`${process.argv.includes("--dry") ? "would change" : "changed"} ${changed} files`);
