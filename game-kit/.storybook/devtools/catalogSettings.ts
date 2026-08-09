// The catalog's hand-off point: what the switches above the story tree currently say.
//
// Storybook globals live in the decorator, and a story render function has no argument for
// them. Rather than let every story reach into the context and assemble its own settings —
// six toggles wired six ways — the decorator publishes ONE object here and `scene()` reads it.
//
// TWO things travel, and the split is the point. `viewer` is the kit's own plane and goes into
// `mount` as an ordinary argument; `text` is the catalog's and never enters the kit at all —
// the kit has no notion of a language, so the words stop at the scene, which draws them.

import { type ViewerSettings } from "../../src/index.js";
import { catalogText, LOCALES, type CatalogLocale, type CatalogText } from "../locales/catalog.js";

export interface CatalogSettings {
  /** The kit's viewer plane: theme, and the hud etalon when a canvas overrides it. */
  readonly viewer: ViewerSettings;
  /** The catalog's words. Resolved here, handed to the scene already written. */
  readonly text: CatalogText;
}

/**
 * THE FIRST VALUE IS READ OFF THE URL, not assumed.
 *
 * The decorator publishes the real settings on the first render — which is late for anything
 * that is read while the story is being PREPARED, and a control's description is exactly that.
 * Started on a default, a page opened in Russian handed out English descriptions and there was
 * no second chance to correct them: Storybook normalises `argTypes` once and keeps the result.
 *
 * `globals=locale:ru` is Storybook's own URL syntax, so this reads what the app is about to be
 * told rather than guessing.
 */
function bootLocale(): CatalogLocale {
  const globals = new URLSearchParams(globalThis.location?.search ?? "").get("globals") ?? "";
  const found = /(?:^|;)locale:([a-z-]+)/i.exec(globals)?.[1];
  return (LOCALES as readonly string[]).includes(found ?? "") ? (found as CatalogLocale) : "en";
}

let current: CatalogSettings = { viewer: { theme: "dark" }, text: catalogText(bootLocale()) };
const listeners = new Set<(s: CatalogSettings) => void>();

export function setCatalogSettings(next: CatalogSettings): void {
  current = next;
  for (const l of listeners) l(next);
}

export function currentSettings(): CatalogSettings {
  return current;
}

/** A live scene follows the switches without being rebuilt. */
export function onSettingsChange(listener: (s: CatalogSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
