import { defineConfig } from "vite";

// The `development` condition is what resolves `game-kit` / `game-kit/pixi` to their SOURCE
// (`src/*.ts`) instead of a built `dist` — the same door the catalog uses, so there is no build
// step for the engine in dev. Vite adds "development" itself in serve mode; it is spelled out
// here so a production `vite build` of this app resolves the engine the same way.
export default defineConfig({
  resolve: {
    conditions: ["development", "module", "browser", "import", "default"],
  },
  server: {
    // ON EVERY INTERFACE, because the game is checked from a phone on the same WiFi. The flag is
    // repeated in the `dev` script on purpose: a config-triggered restart has come back without it,
    // and the loss says nothing — the port is right, the page is up, and only the phone hangs.
    host: true,
    port: 9568,
    // NEVER QUIETLY SOMEWHERE ELSE. Vite's default is to walk to the next free port when this one is
    // taken, so a stray older server keeps the address and the new one answers on a port nobody was
    // told about.
    strictPort: true,
  },
});
