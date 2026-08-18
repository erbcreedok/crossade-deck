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
    host: true,
    port: 9568,
  },
});
