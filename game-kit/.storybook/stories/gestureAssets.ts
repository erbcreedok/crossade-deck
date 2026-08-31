// THE PIECES A TABLE HOLDS THAT NO ADD-ON SHIPS — a poker chip and a chess rook.
//
// Cards come from `@game-presets/cards` and dice from `@game-presets/dice`: real sets with real
// skins, and no page here has any business redrawing them. These two have no add-on of their own,
// so they are drawn here, the way `stockAssets.ts` draws the catalog's pictures — SVG written as
// text and handed over as a data URI. A binary in the repository is a thing nobody can read in a
// diff and everybody forgets to update.
//
// Colours are CSS names on purpose, for the same reason as there: a hex literal outside the theme
// is forbidden by a scan, and a picture is CONTENT rather than a token — it does not follow the
// theme, and it should not.

import { polyline, registerAsset, registerSurface, type Point, type Shape } from "../../src/index.js";

/** SVG text as a data URI. Encoded, not base64: the source stays readable in the network tab. */
function svg(width: number, height: number, body: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(doc)}`;
}

/** The notches round a chip's rim — six pale wedges, the way a real one is moulded. */
const notches = (cx: number, cy: number, r: number, count: number, fill: string): string =>
  Array.from({ length: count }, (_, i) => {
    const a = (i * 360) / count;
    return `<rect x="${cx - 7}" y="${cy - r}" width="14" height="16" rx="3" fill="${fill}" transform="rotate(${a} ${cx} ${cy})"/>`;
  }).join("");

const CHIP = svg(
  100,
  100,
  [
    '<circle cx="50" cy="50" r="48" fill="crimson"/>',
    notches(50, 50, 48, 6, "seashell"),
    '<circle cx="50" cy="50" r="36" fill="none" stroke="seashell" stroke-width="3"/>',
    '<circle cx="50" cy="50" r="28" fill="firebrick"/>',
    '<text x="50" y="60" font-family="Georgia,serif" font-size="26" font-weight="bold" fill="seashell" text-anchor="middle">25</text>',
  ].join(""),
);

/**
 * THE ROOK'S OUTLINE, WRITTEN ONCE — crenellated top, collar, shaft, base — in the picture's own
 * hundredths, clockwise from the top-left merlon.
 *
 * It is one list because a piece that is not a rectangle needs its silhouette in TWO places: the
 * drawing, and the node's own contour. Kept apart they drift, and the tell is unmistakable — the
 * shadow, which is cast from the contour, becomes a slab under a piece that plainly is not one. The
 * kit's doctrine is that the contour is the truth; this is what obeying it looks like for a sprite.
 */
const ROOK_POINTS: ReadonlyArray<readonly [number, number]> = [
  [14, 20], [30, 20], [30, 32], [42, 32], [42, 20], [58, 20], [58, 32], [70, 32], [70, 20], [86, 20],
  [86, 52], [76, 52], [76, 64], [68, 64], [74, 110], [86, 110], [86, 124], [14, 124], [14, 110],
  [26, 110], [32, 64], [24, 64], [24, 52], [14, 52],
];

/** The same outline in ROOT UNITS, centred — a 1 × 1.24 piece. This is the node's own contour. */
export const ROOK_SHAPE: Shape = polyline(
  ROOK_POINTS.map(([x, y]): Point => ({ x: (x - 50) / 100, y: (y - 72) / 100 })),
);

const ROOK = svg(
  100,
  144,
  [
    `<path d="M${ROOK_POINTS.map(([x, y]) => `${x} ${y}`).join(" L")} Z" fill="darkslategray"/>`,
    // Two bands of light across the piece — enough to read as carved rather than cut from paper.
    '<rect x="26" y="54" width="48" height="5" fill="slategray"/>',
    '<rect x="20" y="112" width="60" height="5" fill="slategray"/>',
  ].join(""),
);

/**
 * THE GRIP — the tab a hand takes hold of to move a pile whole, or to gather one that has made
 * itself out of cards lying against each other.
 *
 * IT HAS TO SAY WHAT IT DOES AT A THIRD OF A CARD ACROSS, which rules out almost everything: at
 * that size a letter is a smudge and an outline is a blur. What survives is SILHOUETTE, so the grip
 * is three offset cards — the picture every player already reads as "a stack" — over a plate dark
 * enough to lift them off whatever felt or card the tab happens to be sitting on.
 *
 * The plate is a rounded square rather than a disc on purpose: a disc at this size is a dot, and a
 * dot on a table full of round chips and round seats says nothing about itself. The two ridges
 * under the cards are the universal grab-bar, and they are what makes it read as a thing to PULL
 * rather than a thing to press.
 */
const GRIP = svg(
  100,
  100,
  [
    // The plate: dark, softly rounded, with a pale rim so it holds its edge on a dark felt.
    '<rect x="5" y="5" width="90" height="90" rx="26" fill="midnightblue"/>',
    '<rect x="5" y="5" width="90" height="90" rx="26" fill="none" stroke="lavender" stroke-width="6"/>',
    // THREE BARS, NARROWING DOWNWARD — the drag handle everybody already reads, drawn so that it is
    // also a stack seen edge-on. Bold and few, because the tab is a third of a card across and at
    // that size an outline is a blur and a letter is a smudge: only silhouette survives.
    '<rect x="22" y="28" width="56" height="11" rx="5.5" fill="seashell"/>',
    '<rect x="27" y="45" width="46" height="11" rx="5.5" fill="lavender"/>',
    '<rect x="32" y="62" width="36" height="11" rx="5.5" fill="lavender" opacity="0.7"/>',
  ].join(""),
);

/** The chip's face and the rook's, as SURFACES — a picture is a layer of a record, like any other. */
export const CHIP_SURFACE = "gesture.piece.chip";
export const ROOK_SURFACE = "gesture.piece.rook";
export const GRIP_SURFACE = "gesture.piece.grip";

export function installGesturePieces(): void {
  registerAsset("gesture.chip", { src: CHIP, w: 1, h: 1 });
  registerAsset("gesture.rook", { src: ROOK, w: 1, h: 1.44 });
  registerAsset("gesture.grip", { src: GRIP, w: 1, h: 1 });
  registerSurface(CHIP_SURFACE, { layers: [{ image: "gesture.chip" }] });
  registerSurface(ROOK_SURFACE, { layers: [{ image: "gesture.rook" }] });
  registerSurface(GRIP_SURFACE, { layers: [{ image: "gesture.grip" }] });
}
