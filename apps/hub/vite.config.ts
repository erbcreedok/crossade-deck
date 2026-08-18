import { defineConfig } from "vite";

// The `development` condition is what resolves `game-kit` and the games to their SOURCE instead of
// a built `dist` — no build step for anything in the repo while developing. Vite adds it itself in
// serve mode; it is spelled out so a production `vite build` resolves the same way.
//
// The list REPLACES Vite's defaults, so it has to be complete: dropping `browser` or `module` here
// would silently pick the wrong entry of some third dependency.
export default defineConfig({
  resolve: {
    conditions: ["development", "module", "browser", "import", "default"],
  },
  server: {
    host: true,
    port: 9569,
  },
});
