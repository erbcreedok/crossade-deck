import { defineConfig } from "vite";

// LIBRARY BUILD — for release only.
//
// It is deliberately NOT part of development. A standalone in this repo resolves `game-kit`
// to `src/index.ts` through the `development` condition in package.json, so Vite transpiles
// the kit's TypeScript itself and a change is on screen with no build step at all. Building
// during development would buy nothing and cost the whole class of "I am looking at an old
// dist" bugs.
//
// Vite's build IS Rollup, so this is that answer too — there is no second bundler to add.
export default defineConfig({
  build: {
    lib: {
      entry: new URL("src/index.ts", import.meta.url).pathname,
      formats: ["es"],
      fileName: () => "index.js",
    },
    // A library must not carry its host's copy of anything: the app decides which pixi it
    // runs, and two copies of a renderer in one page is a class of bug we do not need.
    rollupOptions: { external: ["pixi.js"] },
    sourcemap: true,
    target: "es2022",
  },
});
