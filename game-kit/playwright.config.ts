import { defineConfig } from "@playwright/test";

// The E2E layer answers the ONE question no other layer can: does the renderer actually put
// anything on screen. Everything above it runs headless against a fake or a pure function, and
// jsdom has no WebGL at all — so "the plan says draw a square" and "a square is on the glass"
// are two different claims, and only this file makes the second one.
//
// It runs against the BUILT catalog rather than the dev server: a build is what ships, and a
// dev server that transforms on the fly can hide a bundling mistake until deploy day.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // A fixed viewport, because these tests compare pictures: a window that differs between runs
  // would make every comparison a coin toss.
  //
  // What DID make them a coin toss, before the comparisons were moved inside a single frame:
  // capturing a WebGL canvas across two page loads. The frame of the new document is not
  // guaranteed to be on the glass when the capture lands, so the suite blamed the renderer for
  // a scene that drew perfectly well. Serialising the workers looked like it helped and did
  // not — the fix was to compare two regions of ONE frame instead.
  use: { baseURL: "http://127.0.0.1:6007", viewport: { width: 900, height: 640 } },
  webServer: {
    command: "npm run build:catalog && npx http-server storybook-static -p 6007 --silent",
    url: "http://127.0.0.1:6007/index.json",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
  reporter: [["list"]],
});
