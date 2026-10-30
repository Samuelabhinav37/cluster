import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "auth-worker/**/*.test.ts"],
    // A DOM test's first case imports the whole dashboard (about 2 s alone),
    // which passes 5 s when the full suite runs files in parallel.
    testTimeout: 15_000,
  },
});
