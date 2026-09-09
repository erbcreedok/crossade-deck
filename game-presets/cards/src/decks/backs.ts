// THE BACKS — their own slot, common to every face set: any deck wears any of these. Six, from
// the deck design: two WOVEN (plaid, argyle — an SVG pattern turned by `patternTransform`, so the
// diagonal tiles seamlessly at any card size) and four TILED grounds with a crest at centre.
//
// A woven back IS the face: full strength, no crest. A tiled ground sits at half strength under
// its crest — nothing on a real cloth back sits in the middle of the weave.

import { doc, H, keyline, paperRect, px, R, W } from "./card.js";
import { fmt } from "./lettering.js";
import { markAt, SUIT_MARKS, type Mark } from "./marks.js";
import { PAPER } from "./style.js";

export const BACK_NAMES = ["plaid", "argyle", "club", "lattice", "crest", "ink"] as const;
export type BackName = (typeof BACK_NAMES)[number];

const GOLD = "#f2c14e";
const GOLD_HI = "#f8d885";
const INK_DIM = "#cdb98f";
const RIM_MID = "#3a2a1d";
const RIM_LO = "#1d1409";

/** A five-point star in a 0..100 box — the crest's mark. */
const STAR: Mark = { viewBox: [0, 0, 100, 100], d: "M50 4 61 37h35L67 58l11 34-28-21-28 21 11-34L4 37h35Z" };

/** The club glyph of the felt, nine cells square, as the design draws it: 2px cells at a 9px offset in a 36px tile. */
const CLUB = ["..#..#...", ".##..##..", ".###.###.", ".#######.", "#########", ".#######.", "....#....", "....#....", "...###..."];

interface Skin {
  readonly bg: string;
  /** The art, drawn into the inset area — given that area's box. */
  readonly art: (x: number, y: number, w: number, h: number) => string;
  /** The crest at centre, for a tiled back; `undefined` for a woven one. */
  readonly crest?: (cx: number, cy: number, size: number) => string;
}

/** The 36-unit club tile: the glyph in `glyph`, a dot of `accent` at the centre. Tiled at `size` units. */
function clubTile(id: string, glyph: string, accent: string, size: number): string {
  const S = 36;
  const k = size / S;
  const cells = CLUB.flatMap((row, y) =>
    [...row].map((c, x) => (c === "#" ? `<rect x="${9 + x * 2}" y="${9 + y * 2}" width="2" height="2" fill="${glyph}"/>` : "")),
  ).join("");
  const dot = `<rect x="${S / 2 - 1}" y="${S / 2 - 1}" width="2" height="2" fill="${accent}" opacity=".45"/>`;
  return `<pattern id="${id}" width="${fmt(size)}" height="${fmt(size)}" patternUnits="userSpaceOnUse"><g transform="scale(${fmt(k)})" shape-rendering="crispEdges">${cells}${dot}</g></pattern>`;
}

/** The 16-unit lattice tile: ground `a`, four studs of `b`. Tiled at `size` units. */
function latticeTile(id: string, a: string, b: string, size: number): string {
  const k = size / 16;
  const body =
    `<rect width="16" height="16" fill="${a}"/><rect x="6" width="4" height="4" fill="${b}"/>` +
    `<rect x="14" y="6" width="2" height="4" fill="${b}"/><rect y="6" width="2" height="4" fill="${b}"/><rect x="6" y="12" width="4" height="4" fill="${b}"/>`;
  return `<pattern id="${id}" width="${fmt(size)}" height="${fmt(size)}" patternUnits="userSpaceOnUse"><g transform="scale(${fmt(k)})" shape-rendering="crispEdges">${body}</g></pattern>`;
}

/** A pattern-filled rect over the art area, with the pattern's defs beside it. */
function tiled(defs: string, id: string, x: number, y: number, w: number, h: number, opacity: number): string {
  return `<defs>${defs}</defs><rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="url(#${id})" opacity="${opacity}"/>`;
}

/** The design's woven cloths are drawn 200×291 and stretched over the area — nested, `none` aspect. */
function woven(inner: string, x: number, y: number, w: number, h: number): string {
  return `<svg x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" viewBox="0 0 200 291" preserveAspectRatio="none">${inner}</svg>`;
}

const PLAID_BG = "#f7f2e4";
/** One stripe bundle, laid twice at right angles, each pass translucent so overlaps darken like cloth. */
function plaid(): string {
  const P = 46;
  const bars: ReadonlyArray<readonly [number, number, string, number]> = [
    [0, 3.4, "#3f8c78", 0.9], [5, 1, "#2f5a4a", 0.8], [9.5, 2.2, "#b07d5c", 0.85], [13.5, 1, "#3f8c78", 0.55],
    [20, 1.2, "#b07d5c", 0.5], [24, 2.8, "#3f8c78", 0.8], [28.4, 1, "#2f5a4a", 0.7], [33, 2.2, "#b07d5c", 0.8], [37, 1, "#3f8c78", 0.5],
  ];
  const set = bars.map(([x, w, c, o]) => `<rect x="${x}" width="${w}" height="${P}" fill="${c}" opacity="${o}"/>`).join("");
  const pattern = (id: string, turn: number): string =>
    `<pattern id="${id}" width="${P}" height="${P}" patternUnits="userSpaceOnUse" patternTransform="rotate(${turn})">${set}</pattern>`;
  return (
    `<defs>${pattern("plaidA", 45)}${pattern("plaidB", -45)}</defs><rect width="200" height="291" fill="${PLAID_BG}"/>` +
    `<rect width="200" height="291" fill="url(#plaidA)" opacity=".72"/><rect width="200" height="291" fill="url(#plaidB)" opacity=".72"/>`
  );
}

const ARGYLE_BG = "#d8232a";
/** Red ground, a cream lattice of crossing bands with a red thread down each, a small diamond in every cell. */
function argyle(): string {
  const P = 26;
  const band = `<rect width="3.6" height="${P}" fill="${PAPER.stock}"/><rect x="1.3" width="1" height="${P}" fill="${ARGYLE_BG}" opacity=".55"/>`;
  const pattern = (id: string, turn: number, body: string): string =>
    `<pattern id="${id}" width="${P}" height="${P}" patternUnits="userSpaceOnUse" patternTransform="rotate(${turn})">${body}</pattern>`;
  const cell = `<rect x="${P / 2 - 3}" y="${P / 2 - 3}" width="6" height="6" fill="${PAPER.stock}" opacity=".45"/>`;
  return (
    `<defs>${pattern("argA", 45, band)}${pattern("argB", -45, band)}${pattern("argC", 45, cell)}</defs>` +
    `<rect width="200" height="291" fill="${ARGYLE_BG}"/><rect width="200" height="291" fill="url(#argC)"/>` +
    `<rect width="200" height="291" fill="url(#argA)"/><rect width="200" height="291" fill="url(#argB)"/>`
  );
}

const SKINS: Readonly<Record<BackName, Skin>> = {
  plaid: { bg: PLAID_BG, art: (x, y, w, h) => woven(plaid(), x, y, w, h) },
  argyle: { bg: ARGYLE_BG, art: (x, y, w, h) => woven(argyle(), x, y, w, h) },
  club: {
    bg: RIM_MID,
    art: (x, y, w, h) => tiled(clubTile("clubTile", RIM_LO, GOLD, px(22)), "clubTile", x, y, w, h, 0.5),
    crest: (cx, cy, s) => markAt(SUIT_MARKS.club, cx, cy, s, s, GOLD),
  },
  lattice: {
    bg: "#2a3f6b",
    art: (x, y, w, h) => tiled(latticeTile("lattTile", "#2a3f6b", "#7fa3d8", px(13)), "lattTile", x, y, w, h, 0.5),
    crest: (cx, cy, s) => markAt(SUIT_MARKS.diamond, cx, cy, s, s, "#cfe0f7"),
  },
  crest: {
    bg: PAPER.red,
    art: (x, y, w, h) => tiled(clubTile("crestTile", "#8c1a17", GOLD_HI, px(20)), "crestTile", x, y, w, h, 0.5),
    crest: (cx, cy, s) => markAt(STAR, cx, cy, s, s, GOLD_HI),
  },
  ink: {
    bg: PAPER.black,
    art: (x, y, w, h) => tiled(latticeTile("inkTile", PAPER.black, "#2a3a2c", px(13)), "inkTile", x, y, w, h, 0.5),
    crest: (cx, cy, s) => markAt(SUIT_MARKS.spade, cx, cy, s, s, INK_DIM),
  },
};

/** A back, as a whole SVG document: the keyline, a cream ring, the art inset 4px under a rounded clip, the crest. */
export function backSvg(name: BackName): string {
  const skin = SKINS[name];
  const inset = px(4);
  const r = R * 0.6;
  const clip = `<clipPath id="artClip"><rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${H - 2 * inset}" rx="${fmt(r)}" ry="${fmt(r)}"/></clipPath>`;
  return doc(
    `<defs>${clip}</defs>` +
      keyline(PAPER.stock) +
      paperRect(inset, `fill="${skin.bg}"`) +
      `<g clip-path="url(#artClip)">${skin.art(inset, inset, W - 2 * inset, H - 2 * inset)}</g>` +
      (skin.crest ? skin.crest(W / 2, H / 2, W * 0.3) : ""),
  );
}
