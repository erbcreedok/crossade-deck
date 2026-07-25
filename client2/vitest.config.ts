import { defineConfig } from "vitest/config";

// client2 — тесты только на чистые модули (мат карт, физика, единый пул). DOM/setup не нужны.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
