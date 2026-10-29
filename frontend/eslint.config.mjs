import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import raff from "./lint-rules/eslint-plugin-raff.mjs";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "src/lib/api/schema.d.ts",
      "lint-tests/fixtures/**",
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { raff },
    rules: {
      "raff/no-raw-color": "error",
      "raff/no-physical-properties": "error",
      "raff/no-legacy-token": "error",
      "raff/no-raw-font": "error",
      "raff/no-literal-attributes": "error",
      "raff/no-dynamic-class-fragment": "error",
      // CLAUDE.md rule 13: every visible string comes from messages/*.json.
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
];

export default config;
