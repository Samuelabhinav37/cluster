import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src/lib/data/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions, ...globals.serviceworker },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
    },
  },
  {
    // The logger is the one place console.* is allowed.
    files: ["src/lib/log.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "no-console": "off", "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.js", "*.config.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off", "@typescript-eslint/no-explicit-any": "off" },
  },
);
