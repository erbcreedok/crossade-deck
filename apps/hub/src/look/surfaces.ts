// WHAT THE HUB LOOKS LIKE, as registry entries — surfaces, one asset, and the three text roles.
//
// Everything client1 does with CSS, the engine does with a surface record: a panel is layers plus a
// stroke, the gold ring outside the black keyline is a SECOND node under the first (one quad
// carries one stroke, and this look has two), and the hard offset drop is the desk's own lamp.
//
// Zero corner radius comes free: client1 rounds nothing, and a record that names no `radius` has
// none. Nothing has to be switched off.

import { registerAsset, registerSurface, registerTextStyle } from "game-kit";
import { BORDER_U, CLUB_U, PALETTE } from "./palette.js";

/** The three roles the owner picked, all carrying Kazakh. A role is a name; this is what it means. */
export const TITLE = "hub/title";
export const MAIN = "hub/main";
export const NOTE = "hub/note";

export const GROUND = "hub/ground";
export const RING = "hub/ring";
export const TILE = "hub/tile";
export const SLOT = "hub/slot";

// THE CLUB, AS A BITMAP AND NOT AS FORTY RECTANGLES.
//
// client1 ships this glyph as `public/bg-clubs.svg` — 41 hand-written `<rect>`s on a 72×72 tile,
// on a 4px grid offset by 2. Transcribed as rects it would be unreadable in a diff and nobody
// would ever spot a moved pixel; written as rows, the drawing IS the source. The renderer gets
// the rects either way.
const CLUB = [
  "..#..#...",
  ".##..##..",
  ".###.###.",
  ".#######.",
  "#########",
  ".#######.",
  "....#....",
  "....#....",
  "...###...",
];

/** The tile client1 lays over the felt, drawn to its own 72×72 grid. */
function clubTile(): string {
  // client1's own numbers: a 4px cell, the glyph's corner at 18, the whole tile 72. Kept as the
  // pixel counts they are — this picture is a raster, and rounding it to units would round the
  // grid it is drawn on.
  const CELL = 4;
  const AT = 18;
  const SIDE = 72;
  const body = CLUB.flatMap((row, y) =>
    [...row].map((cell, x) =>
      cell === "#"
        ? `<rect x="${AT + x * CELL}" y="${AT + y * CELL}" width="${CELL}" height="${CELL}" fill="${PALETTE.feltDark}"/>`
        : "",
    ),
  ).join("");
  // WIDTH AND HEIGHT, not just a viewBox. An SVG with no intrinsic size is rasterized at whatever
  // the platform calls a default, and the tile then comes out one enormous smear instead of a
  // pattern — which is exactly what it did the first time.
  //
  // NO GROUND RECT, unlike client1's file: the felt is the layer underneath, and a colour written
  // twice is a colour that will disagree with itself.
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}" viewBox="0 0 ${SIDE} ${SIDE}" shape-rendering="crispEdges">${body}</svg>`;
  // Encoded rather than base64 so the source stays readable in a network tab — the same choice the
  // card and dice skins make.
  return `data:image/svg+xml,${encodeURIComponent(doc)}`;
}

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
  registerAsset(GROUND, { src: clubTile(), w: CLUB_U, h: CLUB_U });
  registerSurface(GROUND, { layers: [{ paint: PALETTE.felt }, { image: GROUND, fit: "repeat" }] });

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
