import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "auth-worker/**/*.test.ts"],
  },
});
