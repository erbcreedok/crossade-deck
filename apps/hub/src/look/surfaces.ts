// WHAT THE HUB LOOKS LIKE, as registry entries — surfaces, one asset, and the three text roles.
//
// Everything client1 does with CSS, the engine does with a surface record: a panel is layers plus a
// stroke, the gold ring outside the black keyline is a SECOND node under the first (one quad
// carries one stroke, and this look has two), and the hard offset drop is the desk's own lamp.
//
// Zero corner radius comes free: client1 rounds nothing, and a record that names no `radius` has
// none. Nothing has to be switched off.

import { registerAsset, registerSurface, registerTextStyle } from "game-kit";
import { BORDER_U, PALETTE } from "./palette.js";

/** The three roles the owner picked, all carrying Kazakh. A role is a name; this is what it means. */
export const TITLE = "hub/title";
export const MAIN = "hub/main";
export const NOTE = "hub/note";

export const GROUND = "hub/ground";
export const RING = "hub/ring";
export const TILE = "hub/tile";
export const SLOT = "hub/slot";

/** One 48-unit tile of felt with a pixel club on it — client1's `bg-clubs.svg`, as rects. */
function clubTile(): string {
  const px = (x: number, y: number, w: number, h: number): string =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PALETTE.feltDark}"/>`;
  const body = [
    px(22, 14, 4, 4), // top lobe
    px(18, 18, 4, 4), // left lobe
    px(26, 18, 4, 4), // right lobe
    px(22, 18, 4, 4), // centre
    px(23, 22, 2, 5), // stem
    px(20, 27, 8, 2), // foot
  ].join("");
  // WIDTH AND HEIGHT, not just a viewBox. An SVG with no intrinsic size is rasterized at whatever
  // the platform calls a default, and the tile then comes out one enormous smear instead of a
  // pattern — which is exactly what it did the first time.
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" shape-rendering="crispEdges">${body}</svg>`;
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

  // FLAT FELT, for now. client1 tiles a dark club glyph over it every 72px, and `clubTile()` below
  // draws that glyph — but an image layer over this ground does not reach the glass, with `repeat`
  // or with `contain` alike, while the very same mechanism paints every card face in the solitaire
  // next door. The difference is not understood yet, and guessing at it inside an app is the wrong
  // place: the question belongs in the kit's own catalog, as an isolated case with a test under it.
  // Until then the ground is the base colour, which is what client1 lies under anyway.
  registerAsset(GROUND, { src: clubTile(), w: 0.75, h: 0.75 });
  registerSurface(GROUND, { layers: [{ paint: PALETTE.felt }] });

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
