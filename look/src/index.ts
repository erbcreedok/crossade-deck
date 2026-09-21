// WHAT CROSSADE DECK LOOKS LIKE — the palette, the surfaces built out of it, and the three text
// roles. One place holds the colours, or twenty places will (`palette.ts`).
//
// Its own package because the look is not the hub's: a game opened at its own URL wears the same
// felt, the same gold keyline and the same lettering, and a game that had to import `apps/hub` to
// get them would not be a standalone game at all. The hub dresses its shelf from here; every desk
// dresses its table from here.

export { CLUB_U, FAVOURITE_INKS, PALETTE, PRESS_PX, RING_U, SPARK_U, tint } from "./palette.js";
export {
  GROUND,
  installHubLook,
  installTableLook,
  MAIN,
  NOTE,
  RING,
  SLOT,
  SPARKLE,
  SPARKLE_DIM,
  TILE,
  TITLE,
} from "./surfaces.js";
export { hubRuler } from "./fonts.js";
export { loadingCross, CROSS_PATH, LOADING_MS, type Loading } from "./loading.js";
export { TWINKLE, twinkleLevel, twinkleStep } from "./twinkle.js";
export { AT_REST, DRIFT, DRIFT_DIAMONDS, driftStep, type Drift } from "./drift.js";
