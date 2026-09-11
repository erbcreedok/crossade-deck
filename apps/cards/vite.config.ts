import { defineConfig } from "vite";

// The `development` condition is what resolves `game-kit` and every preset to their SOURCE
// (`src/*.ts`) instead of a built `dist` — the same door the catalog and the hub use, so there is no
// build step for the engine in dev. Vite adds "development" itself in serve mode; it is spelled out
// here so a production `vite build` of this app resolves them the same way.
export default defineConfig({
  resolve: {
    conditions: ["development", "module", "browser", "import", "default"],
  },
  server: {
    // ON EVERY INTERFACE, because the table is checked from a phone on the same WiFi.
    host: true,
    // ITS OWN PORT, next to the solitaire's 9568 and the hub's 9569 — three games up at once is the
    // ordinary case now, and a port that walks is a port nobody was told about.
    port: 9570,
    strictPort: true,
  },
});
