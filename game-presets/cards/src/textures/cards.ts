// CARD TEXTURES — the classic skin's art, drawn as SVG text and handed over as data URIs, exactly
// as the engine's own catalog draws its stock pictures. The add-on SHIPS these: the engine holds no
// image, a game brings its own, and a data URI is legible in a diff and costs the build nothing.
//
// Colour here is CSS keywords, never a theme token — a picture is CONTENT and does not follow the
// theme (a red suit stays red on a dark desk). This whole folder is the one place `cards.no-raw-colour`
// exempts, and even so these are keywords, not hexes. Geometry of the suit marks is reused from
// `suits.ts` (`suitPath`) — one source, whether the engine strokes the mark or an SVG stamps it.

import { suitPath, type SuitName } from "../suits.js";
import type { CardSpec } from "../crossade.js";

const W = 100;
const H = 140;

/** SVG text as a data URI. Encoded, not base64 — the source stays readable in the network tab. */
function svg(body: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(doc)}`;
}

const inkFor = (colour: string): string => (colour === "red" ? "crimson" : "black");

/** The white rounded ground with a hairline border; outside the corners is transparent — a card. */
const GROUND = `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="8" ry="8" fill="white" stroke="silver" stroke-width="1"/>`;

/** A suit mark centred at (cx,cy), sized `d`, optionally turned 180° for the lower half of a face. */
function mark(cx: number, cy: number, d: number, suit: SuitName, fill: string, rot = 0): string {
  return `<g transform="translate(${cx},${cy}) scale(${d}) rotate(${rot})" fill="${fill}"><path d="${suitPath(suit)}"/></g>`;
}

function label(cx: number, cy: number, text: string, size: number, fill: string, rot = 0): string {
  return `<text x="${cx}" y="${cy}" transform="rotate(${rot} ${cx} ${cy})" font-family="Georgia,'Times New Roman',serif" font-weight="bold" font-size="${size}" fill="${fill}" text-anchor="middle" dominant-baseline="central">${text}</text>`;
}

/** A corner index: the rank glyph and a small suit mark beneath it, turned 180° in the far corner. */
function corner(x: number, y: number, rank: string, suit: SuitName, fill: string, rot: number): string {
  return `<g transform="rotate(${rot} ${x} ${y})">${label(x, y, rank, 13, fill)}${mark(x, y + 12, 9, suit, fill)}</g>`;
}

// The classic pip layouts: [x, f] where x is a column and f runs 0 (top) to 1 (bottom). A pip in the
// lower half is turned 180°, the way a real card reads the same upside down.
const L = 34;
const M = 50;
const R = 66;
const LAYOUTS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  2: [[M, 0], [M, 1]],
  3: [[M, 0], [M, 0.5], [M, 1]],
  4: [[L, 0], [R, 0], [L, 1], [R, 1]],
  5: [[L, 0], [R, 0], [M, 0.5], [L, 1], [R, 1]],
  6: [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  7: [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  8: [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [M, 0.75], [L, 1], [R, 1]],
  9: [[L, 0], [R, 0], [L, 0.33], [R, 0.33], [M, 0.5], [L, 0.67], [R, 0.67], [L, 1], [R, 1]],
  10: [[L, 0], [R, 0], [M, 0.2], [L, 0.4], [R, 0.4], [L, 0.6], [R, 0.6], [M, 0.8], [L, 1], [R, 1]],
};

function pips(n: number, suit: SuitName, fill: string): string {
  const rows = LAYOUTS[n] ?? [];
  return rows
    .map(([x, f]) => mark(x, 30 + f * 80, 14, suit, fill, f > 0.5 ? 180 : 0))
    .join("");
}

/** A five-point star, for the jokers. */
function star(cx: number, cy: number, r: number, fill: string): string {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.42;
    return `${(cx + rr * Math.cos(rad)).toFixed(1)},${(cy + rr * Math.sin(rad)).toFixed(1)}`;
  });
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
}

const COURT = new Set(["J", "Q", "K"]);

/** The full face of one card, as a data URI, chosen from what the spec IS. */
export function faceSvg(spec: CardSpec): string {
  if (spec.kind === "brand") {
    const rule = `<rect x="26" y="72" width="48" height="2" fill="crimson"/>`;
    return svg(`${GROUND}${label(50, 60, "crossade", 18, "black")}${rule}${label(50, 88, "deck", 18, "black")}`);
  }
  if (spec.kind === "joker") {
    const fill = inkFor(spec.values.colour ?? "black");
    return svg(`${GROUND}${star(50, 52, 22, fill)}${label(50, 92, "JOKER", 16, fill)}${label(14, 16, "J", 13, fill)}${label(86, 124, "J", 13, fill, 180)}`);
  }
  const suit = spec.values.suit as SuitName;
  const fill = inkFor(spec.values.colour ?? "black");
  const rank = spec.label;
  const corners = corner(14, 16, rank, suit, fill, 0) + corner(86, 124, rank, suit, fill, 180);
  let centre: string;
  if (rank === "A") centre = mark(50, 70, 42, suit, fill);
  else if (COURT.has(rank)) centre = label(50, 66, rank, 52, fill) + mark(50, 104, 22, suit, fill);
  else centre = pips(Number(rank), suit, fill);
  return svg(`${GROUND}${corners}${centre}`);
}

/** The shared back — one patterned texture every card turns over to reveal. */
export function backSvg(): string {
  const lattice = Array.from({ length: 9 }, (_, i) => {
    const t = 12 + i * 10;
    return `<line x1="${t}" y1="6" x2="6" y2="${t + 6}" stroke="lightsteelblue" stroke-width="1"/><line x1="${W - t}" y1="6" x2="${W - 6}" y2="${t + 6}" stroke="lightsteelblue" stroke-width="1"/>`;
  }).join("");
  return svg(
    `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="8" ry="8" fill="midnightblue" stroke="silver" stroke-width="1"/>` +
      `<rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="5" ry="5" fill="none" stroke="lightsteelblue" stroke-width="1.5"/>` +
      lattice +
      star(50, 70, 16, "lightsteelblue"),
  );
}
