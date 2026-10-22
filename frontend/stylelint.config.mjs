const config = {
  plugins: ["./lint-rules/stylelint-raff.mjs"],
  rules: {
    "raff/no-raw-color": true,
    "raff/no-physical-properties": true,
  },
  overrides: [
    {
      // The single source of color values.
      files: ["src/styles/tokens.css"],
      rules: { "raff/no-raw-color": null },
    },
  ],
};

export default config;
