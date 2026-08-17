// DIE FACE TEXTURES — the classic skin's art, one SVG per face, handed over as data URIs exactly as
// the cards add-on does. The add-on SHIPS these: the engine holds no image, a game brings its own,
// and a data URI is legible in a diff and costs the build nothing.
//
// Colour here is CSS keywords, never a theme token — a picture is CONTENT and does not follow the
// theme (an ivory die stays ivory on a dark desk). This folder is the one place `dice.no-raw-colour`
// exempts, and even so these are keywords, not hexes.
//
// Every face is drawn in the SAME square viewBox and clipped by the engine to the kind's silhouette
// (a triangle, a soft square, a hexagon) — so the picture only has to put the right marks in the
// right places for a die seen from straight above.

import type { DieKind } from "../kinds.js";

const S = 100;
const INK = "black";
const BODY = "ivory";
const EDGE = "silver";
const HIGHLIGHT = "crimson";

/** SVG text as a data URI. Encoded, not base64 — the source stays readable in the network tab. */
function svg(body: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(doc)}`;
}

/** A pip — a filled dot; the ONE and the centre of odd faces are red, the printed convention. */
function pip(cx: number, cy: number, red = false): string {
  return `<circle cx="${cx}" cy="${cy}" r="8" fill="${red ? HIGHLIGHT : INK}"/>`;
}

/** Where a d6's pips sit for each face, on a 3×3 grid of the square. */
const GRID = { l: 26, c: 50, r: 74 };
const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[GRID.c, GRID.c]],
  2: [[GRID.l, GRID.l], [GRID.r, GRID.r]],
  3: [[GRID.l, GRID.l], [GRID.c, GRID.c], [GRID.r, GRID.r]],
  4: [[GRID.l, GRID.l], [GRID.r, GRID.l], [GRID.l, GRID.r], [GRID.r, GRID.r]],
  5: [[GRID.l, GRID.l], [GRID.r, GRID.l], [GRID.c, GRID.c], [GRID.l, GRID.r], [GRID.r, GRID.r]],
  6: [[GRID.l, GRID.l], [GRID.r, GRID.l], [GRID.l, GRID.c], [GRID.r, GRID.c], [GRID.l, GRID.r], [GRID.r, GRID.r]],
};

/** A numeral, centred at (x, y); an underline under 6 and 9 the way a real d20 disambiguates them. */
function numeral(value: number, x: number, y: number, size: number): string {
  const under = value === 6 || value === 9 ? `<line x1="${x - size * 0.28}" y1="${y + size * 0.42}" x2="${x + size * 0.28}" y2="${y + size * 0.42}" stroke="${INK}" stroke-width="3"/>` : "";
  return (
    `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="700" fill="${INK}" text-anchor="middle" dominant-baseline="central">${value}</text>` +
    under
  );
}

/** The cube face: an ivory square with a hairline edge and the pips of `value`. */
function d6(value: number): string {
  const dots = (PIPS[value] ?? []).map(([x, y], i, all) => pip(x, y, all.length === 1 || (all.length % 2 === 1 && i === (all.length - 1) / 2))).join("");
  return `<rect x="1" y="1" width="${S - 2}" height="${S - 2}" rx="12" fill="${BODY}" stroke="${EDGE}"/>` + dots;
}

/** The tetrahedron from above: an ivory triangle, its numeral large near the middle. */
function d4(value: number): string {
  const tri = `<polygon points="50,4 96,92 4,92" fill="${BODY}" stroke="${EDGE}"/>`;
  return tri + numeral(value, 50, 62, 40);
}

/** The icosahedron from above: a hexagon with the top face drawn as a triangle and the numeral in it. */
function d20(value: number): string {
  const hex = `<polygon points="50,2 92,26 92,74 50,98 8,74 8,26" fill="${BODY}" stroke="${EDGE}"/>`;
  const face = `<polygon points="50,20 78,68 22,68" fill="none" stroke="${EDGE}" stroke-width="1.5"/>`;
  const ridges = `<path d="M50,20 L50,2 M78,68 L92,74 M22,68 L8,74 M50,20 L92,26 M50,20 L8,26 M78,68 L50,98 M22,68 L50,98" fill="none" stroke="${EDGE}" stroke-width="1"/>`;
  return hex + ridges + face + numeral(value, 50, 54, 26);
}

/** The picture of `kind` showing `value`, as a data URI. */
export function faceSvg(kind: DieKind, value: number): string {
  if (kind === "d6") return svg(d6(value));
  if (kind === "d4") return svg(d4(value));
  return svg(d20(value));
}
