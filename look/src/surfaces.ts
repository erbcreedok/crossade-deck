// WHAT THE HUB LOOKS LIKE, as registry entries — surfaces, one asset, and the three text roles.
//
// Everything client1 does with CSS, the engine does with a surface record: a panel is layers plus a
// stroke, the gold ring outside the black keyline is a SECOND node under the first (one quad
// carries one stroke, and this look has two), and the hard offset drop is the desk's own lamp.
//
// Zero corner radius comes free: client1 rounds nothing, and a record that names no `radius` has
// none. Nothing has to be switched off.

import { registerAsset, registerSurface, registerTextStyle } from "game-kit";
import { clubTile, diamondTile } from "./feltTiles.js";
import { BORDER_U, CLUB_U, PALETTE, SPARK_U } from "./palette.js";

export { DIAMOND_SCATTER, diamondTile } from "./feltTiles.js";

/** The three roles the owner picked, all carrying Kazakh. A role is a name; this is what it means. */
export const TITLE = "hub/title";
export const MAIN = "hub/main";
export const NOTE = "hub/note";

export const GROUND = "hub/ground";
export const RING = "hub/ring";
export const TILE = "hub/tile";
export const SLOT = "hub/slot";

/** The sparkle over the felt, bright in the lobby, muted on the table (`installHubLook` below). */
export const SPARKLE = "hub/sparkle";
export const SPARKLE_DIM = "hub/sparkle-dim";

let installed = false;

/**
 * Register everything the hub draws with. Idempotent, because a hot reload must not stack copies —
 * and called by the consumer rather than run on import, like every other `installStock*`.
 */
export function installHubLook(): void {
  if (installed) return;
  installed = true;

  // THE FELT: the base colour with client1's club glyph tiled over it. `repeat` draws the picture
  // at the size the asset DECLARED, over and over, anchored to the area — so the pattern keeps its
  // scale while the desk is sized past any viewport.
  registerAsset(GROUND, { src: clubTile(PALETTE.feltDark), w: CLUB_U, h: CLUB_U });
  registerSurface(GROUND, { layers: [{ paint: PALETTE.felt }, { image: GROUND, fit: "repeat" }] });

  // THE SPARKLE: no ground paint of its own — it lays over the felt already drawn beneath it, so
  // a transparent tile is the only correct layer. Bright in the lobby, a duller gold and a lower
  // opacity on the table — client1's `.pixel-bg--game` (opacity .55, grayscale, dimmer brightness),
  // approximated the way this look approximates every filter: a second literal colour, not a shader.
  registerAsset(SPARKLE, { src: diamondTile(PALETTE.gold), w: SPARK_U, h: SPARK_U });
  registerSurface(SPARKLE, { layers: [{ image: SPARKLE, fit: "repeat" }] });
  registerAsset(SPARKLE_DIM, { src: diamondTile(PALETTE.sparkleDim), w: SPARK_U, h: SPARK_U });
  registerSurface(SPARKLE_DIM, { layers: [{ image: SPARKLE_DIM, fit: "repeat", opacity: 0.55 }] });

  // The gold plate. The tile's face sits inside it, so what shows is a ring the width of the
  // difference — client1's `box-shadow: 0 0 0 4px` spread, expressed as geometry.
  registerSurface(RING, { layers: [{ paint: PALETTE.gold }] });

  // The face: a brown panel with the black keyline drawn INSIDE its contour (`alignment: 1`), so a
  // bordered node occupies exactly the box it declared and rows stay even.
  registerSurface(TILE, {
    layers: [{ paint: PALETTE.panel }],
    stroke: { color: PALETTE.black, width: BORDER_U, alignment: 1 },
  });

  // An empty place: the well, ringed faintly. Where a game will be, and is not yet.
  registerSurface(SLOT, {
    layers: [{ paint: PALETTE.well }],
    stroke: { color: PALETTE.black, width: BORDER_U, alignment: 1 },
  });

  // THE THREE ROLES. Sizes are in UNITS; which face each one is came from reading the same phrase
  // in all of them, in every case, and is the owner's call, not the engine's.
  registerTextStyle(TITLE, {
    family: "Tiny5, monospace",
    size: 0.62,
    weight: 400,
    lineHeight: 1.3,
    fill: PALETTE.gold,
  });
  registerTextStyle(MAIN, {
    family: "'Press Start 2P', monospace",
    size: 0.19,
    weight: 400,
    lineHeight: 1.6,
    fill: PALETTE.ink,
  });
  registerTextStyle(NOTE, {
    family: "Handjet, monospace",
    size: 0.34,
    weight: 400,
    lineHeight: 1.2,
    fill: PALETTE.inkDim,
  });
}

// THE DESK'S OWN SUKNO, RE-DRESSED. `chessMap`, `nardyMap` and `liveMap` each register their board's
// backdrop under their own name (`"chess.tray"`, `"nardy.felt"`, `"gesture.map"`) with the kit's dark
// theme colour and, for cards, a grey grid tiled over it — right on a catalogue page, wrong on a hub
// whose own felt is already drawn behind it. `registerSurface` keeps only the LAST record filed under
// a name, so calling it again here — after the board has registered its own — replaces the record
// without touching the map that filed it.
//
// TRANSPARENT, not a colour: the hub's own felt already shows behind the game region, and a board on
// top of it needs no ground of its own — the pieces and zones stand directly on the hub's own weave.
const CHESS_TRAY = "chess.tray";
const NARDY_FELT = "nardy.felt";
const GESTURE_MAP = "gesture.map";

/**
 * Re-registers the three boards' own backdrop surfaces so a table reads as part of the hub rather
 * than as a window into the kit's catalogue. Called by the table AFTER it builds its desk (the map
 * files re-register their names every time they run, so this has to run every time too, and the
 * later `registerSurface` call wins).
 */
export function installTableLook(): void {
  installHubLook();
  for (const name of [CHESS_TRAY, NARDY_FELT, GESTURE_MAP]) registerSurface(name, { layers: [] });
  // THE ROUND TABLE IS THE DESIGN'S OWN, as the desks add-on ships it (`installRoundArt`): the lit
  // felt, the three-ring wooden edge, the page's dashed border. Nothing here re-skins it — a second
  // answer to what the table looks like drifted from the first the day the design changed.
}
