// THE DECK SKIN — a style installed into the engine's registries, exactly as `skin.classic.ts`
// installs the classic one: a face surface per card, a surface per back. Swap the style and every
// card in the set changes look at once; nothing about the engine, the set or the game changes.
//
// TWO SOURCES FOR THE SAME LOOK. `raster` is the baked WebP (`baked/<style>/<card>.webp`, written
// by `scripts/bake.ts`) — one picture per card, what a game ships. `vector` is the generator's own
// SVG as a data URI, drawn live: the reference the raster is baked FROM, kept installable so the
// two can stand side by side and a change to the drawing is seen before it is baked. A court under
// `vector` is TWO layers — the paper with its indices, and the figure as a file of its own (see
// `figures.ts` on why an image cannot be handed the accent inline).

import { registerAsset, registerSurface, type PaintLayer, type SurfaceRecord } from "game-kit";
import { crossade, type CardSpec } from "../crossade.js";
import type { SuitName } from "../suits.js";
import { BACK_NAMES, backSvg, type BackName } from "./backs.js";
import { dataUri } from "./card.js";
import { FACE_RADIUS_UNITS, faceSvg, isCourt } from "./face.js";
import { accentOf, deckStyleId, type Accent, type DeckStyle } from "./style.js";

export type DeckSource = "vector" | "raster";

/** The engine treats a card as 1×1.4 units — the proportion every texture here is drawn at. */
const CARD_W = 1;
const CARD_H = 1.4;

/** The face surface for a card under a style — stable and speaking, one name per style and card. */
export function deckFaceSurface(spec: CardSpec, style: DeckStyle): string {
  return `cards/deck/${deckStyleId(style)}/${spec.id}`;
}

/** A back's surface — its own slot, no style in the name: any deck wears any back. */
export function deckBackSurface(name: BackName): string {
  return `cards/deck/back/${name}`;
}

/** The figure asset a vector court layers over its paper. */
function figureAsset(accent: Accent, spec: CardSpec): string {
  return `cards/deck/figure/${accent}/${spec.id}`;
}

/** Where the baked and the figure files live, as URLs the renderer can load — resolved by the bundler. */
const bakedUrl = (style: string, name: string): string => new URL(`./baked/${style}/${name}.webp`, import.meta.url).href;

/**
 * THE SAME PICTURE, FOR SOMETHING THAT IS NOT THE ENGINE — a card's baked face as a plain URL, the
 * one an `<img>` can take.
 *
 * A loading screen is drawn before any canvas exists, so it cannot ask the painter for a surface;
 * and a loading screen showing cards that are not THESE cards is the second answer to "what a card
 * looks like" that drifts from the first the day the deck is redrawn. So the file is named here
 * once, and both the renderer and the page read the same line.
 *
 * Raster only, deliberately: the vector path bakes a data URI at install time and needs the skin
 * installed first, which is exactly the work a loading screen exists to cover.
 */
export function deckFaceImage(spec: CardSpec, style: DeckStyle): string {
  return bakedUrl(deckStyleId(style), spec.id);
}
const figureUrl = (accent: Accent, id: string): string => new URL(`./figures/${accent}/${id}.svg`, import.meta.url).href;

function surface(layers: readonly PaintLayer[]): SurfaceRecord {
  return { layers, radius: FACE_RADIUS_UNITS };
}

/**
 * Install one style: every face, from the baked raster or the live vector. Idempotent — calling
 * again re-registers the same names, which is how a hot reload cannot stack copies.
 */
export function installDeckSkin(style: DeckStyle, source: DeckSource = "raster"): void {
  const id = deckStyleId(style);
  for (const spec of crossade()) {
    const name = deckFaceSurface(spec, style);
    if (source === "raster") {
      registerAsset(name, { src: bakedUrl(id, spec.id), w: CARD_W, h: CARD_H });
      registerSurface(name, surface([{ image: name, fit: "cover" }]));
      continue;
    }
    registerAsset(name, { src: dataUri(faceSvg(spec, style)), w: CARD_W, h: CARD_H });
    const layers: PaintLayer[] = [{ image: name, fit: "cover" }];
    if (style.layout === "classic" && isCourt(spec)) {
      const accent = accentOf(spec.values["suit"] as SuitName, style);
      const figure = figureAsset(accent, spec);
      registerAsset(figure, { src: figureUrl(accent, spec.id), w: CARD_W, h: CARD_H });
      layers.push({ image: figure, fit: "contain" });
    }
    registerSurface(name, surface(layers));
  }
}

/** Install the six backs, from the baked raster or the live vector. */
export function installDeckBacks(source: DeckSource = "raster"): void {
  for (const name of BACK_NAMES) {
    const surfaceName = deckBackSurface(name);
    const src = source === "raster" ? bakedUrl("backs", name) : dataUri(backSvg(name));
    registerAsset(surfaceName, { src, w: CARD_W, h: CARD_H });
    registerSurface(surfaceName, surface([{ image: surfaceName, fit: "cover" }]));
  }
}
