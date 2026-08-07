import { defineConfig } from "vitest/config";

// Two roots, and no third: the kit (`src/`) and the catalog that documents it (`.storybook/`).
// `dist/` is deliberately outside both — a build output picked up as a second copy of the same
// suites is a trap that already cost this project once.
export default defineConfig({
  test: { include: ["src/**/*.test.ts", ".storybook/**/*.test.ts"], environment: "node" },
});
