import type { Preview } from "@storybook/html";
import { addons } from "@storybook/preview-api";
import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { installTheme, t, type ThemeName } from "../src/index.js";
import { catalogText, type CatalogLocale } from "./locales/catalog.js";
import { setCatalogSettings } from "./devtools/catalogSettings.js";
import { onInspect, setNextSceneId } from "./devtools/inspectorBus.js";
import { DocsPage } from "./DocsPage.js";
import { GK_INSPECT } from "./inspectChannel.js";
import { storySource } from "./devtools/storySource.js";

// The preview iframe wears the KIT's tokens, not a second palette kept in step by hand.
// Installed once at module load so a story that does not fill the frame still sits on the
// table surface rather than on white.
if (typeof document !== "undefined") {
  installTheme(document, "dark");
  const style = document.createElement("style");
  // `text-size-adjust` is not cosmetics: on a phone Safari inflates the type in whatever it
  // decides is the main column, and monospace blocks — listings, the node tree — are what it
  // hits first. That is why the code came out roughly twice the height of the prose beside
  // it. Held to 100%, every size in the catalog is the size we wrote.
  style.textContent =
    `html{-webkit-text-size-adjust:100%;text-size-adjust:100%}` +
    `html,body,#storybook-root{height:100%;margin:0;background:${t("stageBg")};color:${t("text")}}`;
  document.head.appendChild(style);
}

// The VIEWER plane is declared here and steered from the catalog settings above the story
// tree. What is NOT here is the hud etalon: it is a setting of one canvas, and a page may
// hold several — so it stands on the canvas, in the scene's own toolbar. Neither kind is a
// story argument: none of this is state.
//
// The rest arrive with the atom that creates the need — debug layers with `Surfaced`, viewer
// owner/other with `Private`, motion-reduce with the first animation.
const globalTypes = {
  theme: { description: "Catalog-wide: chrome, docs and preview" },
  locale: { description: "Catalog-wide: every caption and every page of prose" },
};

function apply(globals: Record<string, unknown>): void {
  const theme = (globals["theme"] as ThemeName) ?? "dark";
  // The words travel BESIDE the viewer plane, not inside it: swapping the whole text object
  // is what makes a half-translated screen impossible, and the kit never sees either half.
  setCatalogSettings({ viewer: { theme }, text: catalogText((globals["locale"] as CatalogLocale) ?? "en") });
  installTheme(document, theme);
}

// Subscribed at module load, not only in the decorator: a docs PAGE is prose that no
// decorator wraps, and it has to follow the language switch like everything else.
if (typeof document !== "undefined") {
  const channel = addons.getChannel();
  channel.on(GLOBALS_UPDATED, ({ globals }: { globals: Record<string, unknown> }) => apply(globals));
  // A scene publishes its tree; the manager's panel is on the other side of the iframe.
  onInspect((report) => channel.emit(GK_INSPECT, report));
}

const preview: Preview = {
  // The catalog IS the documentation, so every subject gets a Docs page — not as an opt-in
  // per file, which is how half of them would quietly end up without one.
  tags: ["autodocs"],

  globalTypes,
  initialGlobals: { theme: "dark", locale: "en" },

  decorators: [
    (story, context) => {
      apply(context.globals);
      // The scene publishes under the story's own id, so a docs page with several stories
      // can put each tree under the canvas it belongs to.
      setNextSceneId(context.id);
      return story();
    },
  ],

  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    // Our own page: prose comes from the bundles, so it follows the language switch.
    docs: { page: DocsPage, toc: true, source: storySource },
    options: {
      storySort: { order: ["Start", "Atoms", "Elements", "Canvas", "HUD"] },
    },
  },
};

export default preview;
