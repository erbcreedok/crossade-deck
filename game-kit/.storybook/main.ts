import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { StorybookConfig } from "@storybook/html-vite";

const require = createRequire(import.meta.url);

/**
 * Absolute paths for the framework and every addon.
 *
 * In a workspace npm is free to hoist `storybook` and `@storybook/core` to the repository root
 * while leaving the framework here — and core then looks for the framework NEXT TO ITSELF and
 * does not find it. The build says `Cannot find module "@storybook/html-vite/preset"`, exits 0,
 * and produces a catalog with no index. Resolving from THIS file removes the guesswork: the
 * config knows where its own dependencies are.
 */
function here(pkg: string): string {
  return dirname(require.resolve(join(pkg, "package.json")));
}

// The catalog is the kit's documentation, so it is plain HTML: our scenes are a view plus
// our own panels, and a framework renderer would only add a layer between them.
const config: StorybookConfig = {
  // The stories live HERE, beside the page that renders them and the words they read: they
  // document the kit, they are not part of it. `src/` ships in a game; this directory does not.
  stories: ["./stories/**/*.stories.ts"],
  // The viewer switches are ours (manager.tsx), not `globalTypes` toolbar entries: theme and
  // language govern the whole catalog and belong above the story tree, while the hud etalon
  // is a scene knob and belongs next to zoom. addon-toolbars renders neither of those places,
  // so it is not installed.
  // Controls, because the alternative is a page of stories per value of one field — exactly
  // what the canon forbids. An atom's FIELDS are its arguments: the reader changes a size and
  // watches the box change, instead of picking a screenshot off a list.
  //
  // Interactions, because a story is the only place some claims can be made at all: a WebGL
  // canvas has no headless stand-in, and "the plan says draw a square" is not "a square is on
  // the glass". Its play functions are OFF by default here — see `devtools/checks.ts` — so a
  // reader flipping through the catalog is not silently driving a test suite.
  addons: [here("@storybook/addon-docs"), here("@storybook/addon-controls"), here("@storybook/addon-interactions")],
  framework: { name: here("@storybook/html-vite"), options: {} },
  // RELATIVE asset paths. The showcase is served from a SUBPATH (`/crossade-deck/` on GitHub
  // Pages), and an absolute base turns every asset into a 404 there while looking perfectly
  // fine on localhost — the failure only appears once it is published.
  viteFinal: async (cfg) => ({ ...cfg, base: "./" }),
};

export default config;
