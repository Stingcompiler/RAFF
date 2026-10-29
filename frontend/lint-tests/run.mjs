// Proves the custom lint rules actually fail on violating files (WO-00 acceptance).
// Run: node lint-tests/run.mjs (part of `pnpm lint`).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import stylelint from "stylelint";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const eslint = new ESLint({ cwd: root });

async function eslintRuleHits(file, ruleId) {
  // Fixtures sit outside src/, so lint them under a src/ path to pick up the project rules.
  const [result] = await eslint.lintText(readFileSync(file, "utf8"), {
    filePath: `${root}src/__lint_fixture__.tsx`,
  });
  return result.messages.filter((m) => m.ruleId === ruleId).map((m) => m.line);
}

async function stylelintRuleHits(file, rule) {
  const { results } = await stylelint.lint({ files: [file], configBasedir: root, cwd: root });
  return results[0].warnings.filter((w) => w.rule === rule).map((w) => w.line);
}

const cases = [
  ["bad-color.tsx", "eslint", "raff/no-raw-color", [5, 6, 7, 8, 9]],
  ["bad-physical.tsx", "eslint", "raff/no-physical-properties", [5, 6, 7, 8, 9, 10]],
  ["bad-text.tsx", "eslint", "react/jsx-no-literals", [5, 6]],
  ["bad-legacy.tsx", "eslint", "raff/no-legacy-token", [5, 6, 7, 8, 9]],
  ["bad-font.tsx", "eslint", "raff/no-raw-font", [5, 6, 7, 8]],
  ["bad-attrs.tsx", "eslint", "raff/no-literal-attributes", [5, 6, 7]],
  ["bad-attrs.tsx", "eslint", "raff/no-dynamic-class-fragment", [8]],
  ["bad-attrs.tsx", "eslint", "raff/no-raw-color", [9, 10]],
  ["good.tsx", "eslint", "raff/no-literal-attributes", []],
  ["good.tsx", "eslint", "raff/no-dynamic-class-fragment", []],
  ["good.tsx", "eslint", "raff/no-raw-font", []],
  ["good.tsx", "eslint", "raff/no-legacy-token", []],
  ["good.tsx", "eslint", "raff/no-raw-color", []],
  ["good.tsx", "eslint", "raff/no-physical-properties", []],
  ["good.tsx", "eslint", "react/jsx-no-literals", []],
  ["bad-color.css", "stylelint", "raff/no-raw-color", [3, 6, 9, 12]],
  ["bad-physical.css", "stylelint", "raff/no-physical-properties", [3, 6, 9, 12, 15]],
  ["good.css", "stylelint", "raff/no-raw-color", []],
  ["good.css", "stylelint", "raff/no-physical-properties", []],
];

let failed = 0;
for (const [name, tool, rule, expected] of cases) {
  const lines =
    tool === "eslint"
      ? await eslintRuleHits(fixture(name), rule)
      : await stylelintRuleHits(fixture(name), rule);
  try {
    assert.deepEqual(
      [...new Set(lines)].sort((a, b) => a - b),
      expected,
    );
    console.log(`ok   ${name} ${rule}`);
  } catch {
    failed += 1;
    console.error(`FAIL ${name} ${rule}: expected lines ${expected}, got ${lines}`);
  }
}
if (failed) process.exit(1);
