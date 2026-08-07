import type { StorybookConfig } from "@storybook/html-vite";

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
  addons: ["@storybook/addon-docs"],
  framework: { name: "@storybook/html-vite", options: {} },
};

export default config;
