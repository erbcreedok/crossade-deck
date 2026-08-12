import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["development", "import", "node", "default"] },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
