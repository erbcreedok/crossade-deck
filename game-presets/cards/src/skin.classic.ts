// THE CLASSIC SKIN — the appearance the crossade set wears: a face surface per card and one shared
// back. A skin is a VALUE, registered into the engine's surface and asset registries exactly like
// the kit's own `installStock*` functions. Swap the record behind `cards/back` and every card turns
// over at once, nothing walked — the whole reason a look is a record and not a field on the node.
//
// Each face is one self-contained texture (see `textures/cards.ts`); the surface is just that image,
// clipped to a card's rounded corner. The suit geometry inside the textures is the SAME `suitPath`
// the engine would stroke — the marks are vector shapes, drawn here into a picture.

import { registerAsset, registerSurface, type SurfaceRecord } from "game-kit";
import { crossade, type CardSpec } from "./crossade.js";
import { backSvg, faceSvg } from "./textures/cards.js";

/** A card's rounded corner, in units. */
const FACE_RADIUS = 0.06;
/** The engine treats a card as 1×1.4 units — the proportion the textures are drawn at. */
const CARD_W = 1;
const CARD_H = 1.4;

/** The one back surface every card reveals when turned. */
export const BACK_SURFACE = "cards/back";

/** The face surface name for a spec — stable and speaking, keyed by the card's id. */
export function faceSurface(spec: CardSpec): string {
  return `cards/face/${spec.id}`;
}

/** A surface that is just one texture, filled to cover the card and clipped to its corner. */
function imageSurface(image: string): SurfaceRecord {
  return { layers: [{ image, fit: "cover" }], radius: FACE_RADIUS };
}

/**
 * Register the classic look for the whole set: the shared back, then a face per card. Idempotent —
 * calling again re-registers the same names, which is how a hot reload cannot stack copies.
 */
export function installClassicSkin(): void {
  registerAsset(BACK_SURFACE, { src: backSvg(), w: CARD_W, h: CARD_H });
  registerSurface(BACK_SURFACE, imageSurface(BACK_SURFACE));
  for (const spec of crossade()) {
    const name = faceSurface(spec);
    registerAsset(name, { src: faceSvg(spec), w: CARD_W, h: CARD_H });
    registerSurface(name, imageSurface(name));
  }
}
