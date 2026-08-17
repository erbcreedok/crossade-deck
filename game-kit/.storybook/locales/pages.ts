// PROSE, PER PAGE — loaded when that page is opened, and not before.
//
// The words split in two along the line that decides how they GROW. The chrome (`catalog.ts`)
// is a fixed set: a toolbar, a tree, a handful of captions, present on every screen — a page
// that did not load it would render half-written. Prose is the opposite: one page's text is
// dead weight on every other page, and the catalog gains pages forever. Kept in one bundle it
// is the whole documentation downloaded to read one paragraph of it.
//
// So the chrome is imported statically and prose arrives through `import()`. The loaders are
// spelled out rather than globbed: a page that exists is a page someone wrote a story for, and
// a typo in a filename should fail the build here, not the render over there.
//
// A page bundle is loaded WHOLE, per language. That is the same rule as the chrome's and for
// the same reason — a half-translated screen is the one outcome that teaches a reader to
// distrust the switch, and it is only impossible while the swap is one object at a time.

import { catalogText, type CatalogKey, type CatalogLocale, type CatalogText, type TextParams } from "./catalog.js";

// Types only — erased at compile time, so naming the bundles here costs nothing at runtime and
// keeps every prose key checkable by `tsc` instead of by hope.
import type bounded from "./pages/bounded/en.json";
import type cards from "./pages/cards/en.json";
import type coated from "./pages/coated/en.json";
import type container from "./pages/container/en.json";
import type draggable from "./pages/draggable/en.json";
import type engine from "./pages/engine/en.json";
import type flippable from "./pages/flippable/en.json";
import type gettingStarted from "./pages/gettingStarted/en.json";
import type grippable from "./pages/grippable/en.json";
import type intro from "./pages/intro/en.json";
import type inviting from "./pages/inviting/en.json";
import type labeled from "./pages/labeled/en.json";
import type lit from "./pages/lit/en.json";
import type owned from "./pages/owned/en.json";
import type placeable from "./pages/placeable/en.json";
import type motion from "./pages/motion/en.json";
import type node from "./pages/node/en.json";
import type presetsBounds from "./pages/presetsBounds/en.json";
import type presetsComponents from "./pages/presetsComponents/en.json";
import type presetsCoats from "./pages/presetsCoats/en.json";
import type presetsFlips from "./pages/presetsFlips/en.json";
import type presetsLayouts from "./pages/presetsLayouts/en.json";
import type presetsPiles from "./pages/presetsPiles/en.json";
import type presetsPoses from "./pages/presetsPoses/en.json";
import type privatePage from "./pages/private/en.json";
import type presetsSurfaces from "./pages/presetsSurfaces/en.json";
import type root from "./pages/root/en.json";
import type shadowCaster from "./pages/shadowCaster/en.json";
import type surfaced from "./pages/surfaced/en.json";
import type tiltable from "./pages/tiltable/en.json";
import type transformable from "./pages/transformable/en.json";
import type valued from "./pages/valued/en.json";
import type tests from "./pages/tests/en.json";

type Loader = () => Promise<{ default: Record<string, string | string[]> }>;

const PAGES: Record<string, Record<CatalogLocale, Loader>> = {
  node: { en: () => import("./pages/node/en.json"), ru: () => import("./pages/node/ru.json") },
  root: { en: () => import("./pages/root/en.json"), ru: () => import("./pages/root/ru.json") },
  bounded: { en: () => import("./pages/bounded/en.json"), ru: () => import("./pages/bounded/ru.json") },
  surfaced: { en: () => import("./pages/surfaced/en.json"), ru: () => import("./pages/surfaced/ru.json") },
  transformable: {
    en: () => import("./pages/transformable/en.json"),
    ru: () => import("./pages/transformable/ru.json"),
  },
  container: { en: () => import("./pages/container/en.json"), ru: () => import("./pages/container/ru.json") },
  coated: { en: () => import("./pages/coated/en.json"), ru: () => import("./pages/coated/ru.json") },
  flippable: { en: () => import("./pages/flippable/en.json"), ru: () => import("./pages/flippable/ru.json") },
  tiltable: { en: () => import("./pages/tiltable/en.json"), ru: () => import("./pages/tiltable/ru.json") },
  draggable: { en: () => import("./pages/draggable/en.json"), ru: () => import("./pages/draggable/ru.json") },
  shadowCaster: {
    en: () => import("./pages/shadowCaster/en.json"),
    ru: () => import("./pages/shadowCaster/ru.json"),
  },
  lit: { en: () => import("./pages/lit/en.json"), ru: () => import("./pages/lit/ru.json") },
  inviting: { en: () => import("./pages/inviting/en.json"), ru: () => import("./pages/inviting/ru.json") },
  grippable: { en: () => import("./pages/grippable/en.json"), ru: () => import("./pages/grippable/ru.json") },
  private: { en: () => import("./pages/private/en.json"), ru: () => import("./pages/private/ru.json") },
  valued: { en: () => import("./pages/valued/en.json"), ru: () => import("./pages/valued/ru.json") },
  owned: { en: () => import("./pages/owned/en.json"), ru: () => import("./pages/owned/ru.json") },
  labeled: { en: () => import("./pages/labeled/en.json"), ru: () => import("./pages/labeled/ru.json") },
  placeable: { en: () => import("./pages/placeable/en.json"), ru: () => import("./pages/placeable/ru.json") },
  intro: { en: () => import("./pages/intro/en.json"), ru: () => import("./pages/intro/ru.json") },
  gettingStarted: {
    en: () => import("./pages/gettingStarted/en.json"),
    ru: () => import("./pages/gettingStarted/ru.json"),
  },
  engine: { en: () => import("./pages/engine/en.json"), ru: () => import("./pages/engine/ru.json") },
  presetsBounds: {
    en: () => import("./pages/presetsBounds/en.json"),
    ru: () => import("./pages/presetsBounds/ru.json"),
  },
  presetsSurfaces: {
    en: () => import("./pages/presetsSurfaces/en.json"),
    ru: () => import("./pages/presetsSurfaces/ru.json"),
  },
  presetsCoats: {
    en: () => import("./pages/presetsCoats/en.json"),
    ru: () => import("./pages/presetsCoats/ru.json"),
  },
  presetsFlips: {
    en: () => import("./pages/presetsFlips/en.json"),
    ru: () => import("./pages/presetsFlips/ru.json"),
  },
  presetsComponents: {
    en: () => import("./pages/presetsComponents/en.json"),
    ru: () => import("./pages/presetsComponents/ru.json"),
  },
  presetsLayouts: {
    en: () => import("./pages/presetsLayouts/en.json"),
    ru: () => import("./pages/presetsLayouts/ru.json"),
  },
  presetsPoses: {
    en: () => import("./pages/presetsPoses/en.json"),
    ru: () => import("./pages/presetsPoses/ru.json"),
  },
  presetsPiles: {
    en: () => import("./pages/presetsPiles/en.json"),
    ru: () => import("./pages/presetsPiles/ru.json"),
  },
  cards: { en: () => import("./pages/cards/en.json"), ru: () => import("./pages/cards/ru.json") },
  motion: { en: () => import("./pages/motion/en.json"), ru: () => import("./pages/motion/ru.json") },
  tests: { en: () => import("./pages/tests/en.json"), ru: () => import("./pages/tests/ru.json") },
};

/** Every page that has prose. A story naming one that is not here shows no prose, and says so. */
export const PAGE_NAMES = Object.keys(PAGES);

/** Every prose key in the catalog — the union of the reference bundles, checked by `tsc`. */
export type PageKey = keyof (typeof node &
  typeof root &
  typeof engine &
  typeof bounded &
  typeof surfaced &
  typeof transformable &
  typeof container &
  typeof coated &
  typeof flippable &
  typeof tiltable &
  typeof draggable &
  typeof shadowCaster &
  typeof lit &
  typeof inviting &
  typeof grippable &
  typeof privatePage &
  typeof valued &
  typeof owned &
  typeof labeled &
  typeof placeable &
  typeof intro &
  typeof gettingStarted &
  typeof presetsBounds &
  typeof presetsSurfaces &
  typeof presetsComponents &
  typeof presetsLayouts &
  typeof presetsPoses &
  typeof presetsPiles &
  typeof presetsCoats &
  typeof presetsFlips &
  typeof cards &
  typeof motion &
  typeof tests);

/** A page's own words, plus the chrome — one object, so a caption cannot be half-swapped. */
export interface PageText extends CatalogText {
  text(key: PageKey | CatalogKey, params?: TextParams): string;
}

/**
 * `docs.bounded.component` belongs to the page `bounded`. The page is the SECOND segment: the
 * first says these are docs at all, and the rest names the block within the page.
 */
export function pageOf(key: string): string | undefined {
  const name = key.split(".")[1];
  return name && key.startsWith("docs.") && name in PAGES ? name : undefined;
}

const cache = new Map<string, PageText>();
const inFlight = new Map<string, Promise<PageText>>();

/** What a loaded page's words are cached under: one entry per page and language. */
function slot(page: string, locale: CatalogLocale): string {
  return `${page}:${locale}`;
}

/** Already here, or not yet — for a caller that must render synchronously. */
export function loadedPage(page: string, locale: CatalogLocale): PageText | undefined {
  return cache.get(slot(page, locale));
}

/**
 * The words of one page, in one language. Resolving falls through to the chrome, and then to
 * the reference bundle, exactly as before — a page has no separate rules, only its own file.
 *
 * An unknown page name resolves to the chrome alone rather than throwing: a page that names
 * prose nobody wrote should read as prose missing, not as a catalog that will not open.
 */
export async function loadPage(page: string, locale: CatalogLocale): Promise<PageText> {
  const key = slot(page, locale);
  const ready = cache.get(key);
  if (ready) return ready;
  // Two blocks asking for the same page at once must not fetch it twice — and, more to the
  // point, must not each build their own copy of the resolver.
  const flying = inFlight.get(key);
  if (flying) return flying;

  const chrome = catalogText(locale);
  const loaders = PAGES[page];
  const work = (async (): Promise<PageText> => {
    const own = loaders ? flatten((await loaders[locale]()).default) : {};
    const built: PageText = {
      locale: chrome.locale,
      plural: chrome.plural,
      text: (k, params) => (k in own ? substitute(own[k]!, params) : chrome.text(k as CatalogKey, params)),
    };
    cache.set(key, built);
    inFlight.delete(key);
    return built;
  })();
  inFlight.set(key, work);
  return work;
}

/** Lines in, one markdown block out — the same shape a chrome bundle may take. */
function flatten(bundle: Record<string, string | string[]>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(bundle).map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : value]),
  );
}

function substitute(template: string, params: TextParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => String(params[name] ?? whole));
}

/**
 * Every page bundle carries every key its reference bundle has. The chrome's own check cannot
 * see these files at all — which is the trap a split introduces: prose that quietly stops
 * being translated while the completeness test goes on passing.
 */
export async function missingPageKeys(locale: CatalogLocale): Promise<string[]> {
  const out: string[] = [];
  for (const page of PAGE_NAMES) {
    const reference = Object.keys((await PAGES[page]!.en()).default);
    const have = new Set(Object.keys((await PAGES[page]![locale]()).default));
    out.push(...reference.filter((key) => !have.has(key)));
  }
  return out;
}

/** Testing and tooling: forget what was loaded, so a case starts from cold. */
export function resetPages(): void {
  cache.clear();
  inFlight.clear();
}
