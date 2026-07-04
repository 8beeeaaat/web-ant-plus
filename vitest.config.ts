import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      thresholds: {
        statements: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
