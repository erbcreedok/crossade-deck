import type { Preview } from "@storybook/html";
import { addons } from "@storybook/preview-api";
import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { installTheme, t, type ThemeName } from "../src/index.js";
import { catalogText, type CatalogLocale } from "./locales/catalog.js";
import { currentSettings, setCatalogSettings } from "./devtools/catalogSettings.js";
import { onInspect, setNextSceneId } from "./devtools/inspectorBus.js";
import { DocsPage } from "./DocsPage.js";
import { GK_INSPECT } from "./inspectChannel.js";
import { storySource } from "./devtools/storySource.js";
import { pinTextSize } from "./devtools/textSize.js";
import "./devtools/snippetValues.js";

// The preview iframe wears the KIT's tokens, not a second palette kept in step by hand.
// Installed once at module load so a story that does not fill the frame still sits on the
// desk surface rather than on white.
if (typeof document !== "undefined") {
  installTheme(document, "dark");
  // Shared with the manager rather than written twice: the boost is a property of the
  // DOCUMENT, and the catalog has two of them.
  pinTextSize(document);
  const style = document.createElement("style");
  style.textContent = `html,body,#storybook-root{height:100%;margin:0;background:${t("stageBg")};color:${t("text")}}`;
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

/**
 * A LANGUAGE CHANGE RELOADS THE PREVIEW, and only a language change.
 *
 * Almost everything here follows the switch live: prose is resolved when it is drawn, and a
 * scene re-reads its captions on notification. Control DESCRIPTIONS cannot — Storybook
 * normalises `argTypes` once while a story is prepared and keeps the result, so a description
 * read then is the description forever, whatever it was read from.
 *
 * The choice is between a screen half in one language and a reload. The catalog has held from
 * the start that a half-translated screen is the outcome that teaches a reader to distrust the
 * switch, so it reloads. The URL already carries the new value — it is Storybook's own globals
 * syntax — which is what makes this terminate: after the reload the booted locale equals the
 * global, and nothing fires again.
 */
function reloadForLocale(next: CatalogLocale): void {
  const url = new URL(globalThis.location.href);
  const globals = (url.searchParams.get("globals") ?? "")
    .split(";")
    .filter((pair) => pair && !pair.startsWith("locale:"))
    .concat(`locale:${next}`)
    .join(";");
  url.searchParams.set("globals", globals);
  globalThis.location.replace(url.toString());
}

function apply(globals: Record<string, unknown>): void {
  const theme = (globals["theme"] as ThemeName) ?? "dark";
  // The words travel BESIDE the viewer plane, not inside it: swapping the whole text object
  // is what makes a half-translated screen impossible, and the kit never sees either half.
  const locale = (globals["locale"] as CatalogLocale) ?? "en";
  if (locale !== currentSettings().text.locale) {
    reloadForLocale(locale);
    return;
  }
  setCatalogSettings({ viewer: { theme }, text: catalogText(locale) });
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
      // THE SIDEBAR IS THE LADDER, not the alphabet. The catalog teaches in one direction: a
      // node, then the box, then what paints it, then the pose, then the arrangement. Left to
      // sort itself the tree reads `Atoms · Basics`, and inside Atoms `Bounded · Container ·
      // Surfaced · Transformable` — `Container` arriving before the things it arranges and
      // `Surfaced` before the area it needs. Every reader would meet the answers first.
      //
      // The previous list was FLAT (`["Start", "Atoms", …]`) while every name but the first had
      // moved under `Start`. Nothing threw; the tree simply went back to sorting itself.
      //
      // Written out here rather than imported, and that is not a style choice: the index
      // builder reads this file STATICALLY and cannot follow an identifier. Given one it warns,
      // skips the index — and `storybook build` still exits 0, leaving a catalog with no
      // `index.json` at all. Guarded by `order.*` in `storyOrder.test.ts`, which scans this
      // literal rather than importing it, for the same reason.
      // The shape every well-worn library docs site has: what it is, then how to start, then
      // the concepts, then the pieces. A reader landing here cold meets them in that order or
      // not at all. A string followed by an array means "this group, and these are its
      // children" — so everything below `Start` lives inside ONE array after it.
      storySort: {
        order: [
          // FOUR GENRES, FOUR SECTIONS — Diátaxis, and the reason the ladder used to feel like
          // one long note in one voice. A page that teaches, instructs, states facts and
          // explains at once serves none of the four readers it is written for.
          //
          //   Start   — the lesson: what this is, and building the first desk.
          //   Basics  — the model's own vocabulary.
          //   Atoms   — reference: what a node can BE, field by field.
          //   Presets — the ready-made, assembled out of those atoms and nothing else.
          //   Engine  — explanation, for whoever works on the kit rather than with it.
          //
          // A how-to section ("Build a game") belongs between Atoms and Engine and is not here
          // yet: an empty section teaches worse than a missing one.
          "Start",
          ["Introduction", "Getting Started"],
          "Basics",
          ["Node", "Root"],
          "Atoms",
          ["Bounded", "Surfaced", "Coated", "Transformable", "Container", "Flippable", "Tiltable", "Draggable", "Grippable", "ShadowCaster", "Lit", "Inviting"],
          // Presets stand on the atoms and are the first pages where a scene is allowed to be
          // several nodes at once: an assembly is what a preset IS. Split by what each preset
          // GENERATES, not by which file of the kit it happens to live in.
          "Presets",
          ["Bounds", "Surfaces", "Coats", "Flips", "Poses", "Layouts", "Piles", "Components"],
          // Add-ons stand OUTSIDE the kit: a preset package that ships its own textures and presets
          // (`@game-presets/*`), documented here but explicitly not part of the core the pages above show.
          "Add-ons",
          ["Cards"],
          "Engine",
          ["Overview", "The chain", "Sizes", "Inheritance", "Baking nodes", "Presets and records", "Motion"],
          "Elements",
          "HUD",
          // Last, because it is ABOUT the catalog rather than of it: the pages that check the
          // pictures above them. Opening one runs its checks — the section is the switch.
          "Tests",
          ["Node", "Bounded", "Surfaced", "Coated", "Transformable", "Container", "Tiltable", "Flippable", "Draggable", "Grippable", "ShadowCaster", "Inviting"],
        ],
      },
    },
  },
};

export default preview;
