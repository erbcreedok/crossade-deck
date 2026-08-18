import { defineConfig } from "vitest/config";

// The same `development` condition the app resolves with, spelled out again because tsc's
// `customConditions` does not reach a test runner.
export default defineConfig({
  resolve: { conditions: ["development", "import", "node", "default"] },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
