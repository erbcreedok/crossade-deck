// WHAT THE HUB LOOKS LIKE, as registry entries — surfaces, one asset, and the three text roles.
//
// Everything client1 does with CSS, the engine does with a surface record: a panel is layers plus a
// stroke, the gold ring outside the black keyline is a SECOND node under the first (one quad
// carries one stroke, and this look has two), and the hard offset drop is the desk's own lamp.
//
// Zero corner radius comes free: client1 rounds nothing, and a record that names no `radius` has
// none. Nothing has to be switched off.

import { registerAsset, registerSurface, registerTextStyle } from "game-kit";
import { ROUND_SURFACE } from "@game-presets/desks";
import { BORDER_U, CLUB_U, PALETTE, SPARK_U } from "./palette.js";

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

// THE DIAMOND, AS A BITMAP OVER A TRANSPARENT TILE.
//
// client1 ships this glyph as `public/bg-diamonds.svg` — a scatter of hand-placed pixel diamonds,
// each shimmering on its own SMIL clock. One glyph per tile, the same simplification the club
// weave already makes, keeps the source a shape a reader can see rather than a list of rects; the
// shimmer itself is not baked into the picture (a `Coated` wash animates it instead, in `shell.ts`)
// because a still asset cannot carry a clock of its own.
const DIAMOND = [
  "....#....",
  "...###...",
  "..#####..",
  ".#######.",
  "#########",
  ".#######.",
  "..#####..",
  "...###...",
  "....#....",
];

/** The tile the sparkle repeats on — wider than the club's, so the glyphs read as scattered. */
function diamondTile(color: string): string {
  const CELL = 4;
  const SIDE = 144;
  const GLYPH = DIAMOND.length * CELL;
  const AT = (SIDE - GLYPH) / 2;
  const body = DIAMOND.flatMap((row, y) =>
    [...row].map((cell, x) =>
      cell === "#"
        ? `<rect x="${AT + x * CELL}" y="${AT + y * CELL}" width="${CELL}" height="${CELL}" fill="${color}"/>`
        : "",
    ),
  ).join("");
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}" viewBox="0 0 ${SIDE} ${SIDE}" shape-rendering="crispEdges">${body}</svg>`;
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
  // THE ROUND TABLE IS ITS OWN GROUND, not a board laid over the hub's already-visible felt — the
  // other three go transparent because the hub's weave already shows behind them; this one IS the
  // whole visible table, so it gets the hub's own tone instead of the kit's plain sunken grey. A
  // shade darker than the wallpaper (`feltDark`, the same one the club glyph is cut from) so the
  // table reads as furniture standing on the felt, and a thin gold rim marks where a card may not
  // be carried past.
  registerSurface(ROUND_SURFACE, {
    layers: [{ paint: PALETTE.feltDark }],
    stroke: { color: PALETTE.gold, width: 0.04 },
  });
}
