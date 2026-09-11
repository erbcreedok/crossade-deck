import { defineConfig } from "vite";

// The `development` condition is what resolves `game-kit` and every preset to their SOURCE
// (`src/*.ts`) instead of a built `dist`. Vite adds it itself in serve mode; it is spelled out here
// so a production `vite build` of this app resolves them the same way.
export default defineConfig({
  resolve: {
    conditions: ["development", "module", "browser", "import", "default"],
  },
  server: {
    // ON EVERY INTERFACE, because the board is checked from a phone on the same WiFi.
    host: true,
    // ITS OWN PORT. NOT 9568-9570: those are taken by the solitaire, the hub and the card table, and
    // a port that WALKS when taken is a port nobody was told about — which is what `strictPort`
    // refuses to do.
    port: 9574,
    strictPort: true,
  },
});
