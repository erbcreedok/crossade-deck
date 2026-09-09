// THE FACE OF A CARD, DRAWN FROM A STYLE — the deck design (`Колоды.dc.html`), number for number.
//
// CLASSIC: the paper with a thin white keyline and a faint inner rule, an index in the top-left corner
// (rank over a small pip) mirrored into the bottom-right so the card reads the same upside down,
// and the standard pip grid at centre — or one big pip for the ace, or the engraved figure for a
// court. The joker sets its word small in both corners and wears its hat at centre.
//
// MINIMAL: the kit's own card — the same paper, ONE index in the corner, ONE mark at centre. A
// court is a letter and a mark like any number; the joker is its word top and bottom and the hat.
//
// NO PIP IS DRAWN TWICE. A face defines its suit's path once and `<use>`s it for every pip and
// both corner marks — the whole reason a number card is a few hundred bytes of text.
//
// THE BRAND CARD has no art in the design, so it wears the deck's own paper and letters: the two
// words of its label set in the pixel font, a red rule between them — the same card in both
// layouts, only the paper changing, and never in Cyrillic: a brand is a name.

import type { CardSpec } from "../crossade.js";
import type { SuitName } from "../suits.js";
import { doc, H, keyline, paperRect, px, R, W } from "./card.js";
import { inlineFigure } from "./figures.js";
import { fmt, lettering, textWidth } from "./lettering.js";
import { JOKER_HAT, markAt, markDef, markUse, SUIT_MARKS } from "./marks.js";
import { ACCENT_PAINT, accentOf, inkOf, jokerWord, PAPER, rankLabel, type DeckStyle } from "./style.js";

/** What a face may need beyond its spec and style: the court's engraving, as SVG text. */
export interface FaceArt {
  /** The figure for a J/Q/K under the classic layout. Absent, the court is drawn without it. */
  readonly figure?: string;
}

const PIP = "pip";
const COURT_RANKS: ReadonlySet<string> = new Set(["J", "Q", "K"]);

/** The face, as a whole SVG document. */
export function faceSvg(spec: CardSpec, style: DeckStyle, art: FaceArt = {}): string {
  if (spec.kind === "brand") return doc((style.layout === "classic" ? classicPaper() : minimalPaper()) + brand(spec));
  if (spec.kind === "joker") {
    const ink = spec.values["colour"] === "red" ? PAPER.red : PAPER.black;
    return doc(style.layout === "classic" ? classicJoker(ink, style) : minimalJoker(ink, style));
  }
  const suit = spec.values["suit"] as SuitName;
  const rank = spec.values["rank"]!;
  const ink = inkOf(suit, style);
  if (style.layout === "minimal") return doc(minimalFace(rank, suit, ink, style));
  if (COURT_RANKS.has(rank)) return doc(classicCourt(rank, suit, ink, style, art.figure));
  return doc(classicPips(rank, suit, ink, style));
}

// ---------------------------------------------------------------- classic

/**
 * The classic paper: the keyline (see `card.ts`), a cream margin, and at 6px the grey rule that
 * bounds the drawing without competing with it — the design's `inset 0 0 0 6px rgba(black,.2)`.
 */
function classicPaper(): string {
  return (
    keyline(PAPER.stock) +
    paperRect(px(5.5), `fill="none" stroke="${PAPER.black}" stroke-opacity="0.2" stroke-width="${px(1)}"`)
  );
}

/**
 * One corner index — the rank over a small pip, the column centred as the design's flex column
 * is — at the top-left; `mirrored()` turns it into the far corner.
 */
function classicIndex(rank: string, suit: SuitName, ink: string, style: DeckStyle): string {
  const size = W * (rank === "10" ? 0.12 : 0.16);
  const pip = W * 0.12;
  const gap = W * 0.02;
  const label = rankLabel(rank, style);
  const column = Math.max(textWidth(label, size), pip);
  const cx = W * 0.09 + column / 2;
  const top = W * 0.07;
  return (
    lettering(label, cx - textWidth(label, size) / 2, top, size, ink) +
    markUse(PIP, SUIT_MARKS[suit], cx, top + size + gap + pip / 2, pip, ink)
  );
}

/** The same mark turned about the paper's centre: the far corner, upside down. */
function mirrored(body: string): string {
  return `<g transform="rotate(180 ${W / 2} ${H / 2})">${body}</g>`;
}

// THE STANDARD PIP GRID, in fractions of the width (x) and height (y) — the design's own numbers,
// measured against the index block's clearance: columns at 0.33/0.5/0.67 leave more than a pip
// between them, the four-row layout of the 10 starts lower so its top pip clears the corner.
const L = 0.33;
const C = 0.5;
const RIGHT = 0.67;
const T = 0.225;
const M = 0.5;
const B = 0.775;
const ROWS_4 = [0.27, 0.43, 0.57, 0.73];
/** x, y, and whether the pip is turned — the lower half reads the same upside down. */
type Spot = readonly [number, number, boolean?];
const sides = (rows: readonly number[]): Spot[] => rows.flatMap((y): Spot[] => [[L, y, y > 0.5], [RIGHT, y, y > 0.5]]);
const SPOTS: Readonly<Record<string, readonly Spot[]>> = {
  A: [[C, M]],
  "2": [[C, T], [C, B, true]],
  "3": [[C, T], [C, M], [C, B, true]],
  "4": [[L, T], [RIGHT, T], [L, B, true], [RIGHT, B, true]],
  "5": [[L, T], [RIGHT, T], [C, M], [L, B, true], [RIGHT, B, true]],
  "6": sides([T, M, B]),
  "7": [...sides([T, M, B]), [C, (T + M) / 2]],
  "8": [...sides([T, M, B]), [C, (T + M) / 2], [C, (M + B) / 2, true]],
  "9": [...sides(ROWS_4), [C, M]],
  "10": [...sides(ROWS_4), [C, 0.316], [C, 0.684, true]],
};

/** A number or the ace: the paper, both indices, the grid (or the one big pip). */
function classicPips(rank: string, suit: SuitName, ink: string, style: DeckStyle): string {
  const index = classicIndex(rank, suit, ink, style);
  const size = W * (rank === "A" ? 0.44 : 0.16);
  const pips = (SPOTS[rank] ?? [])
    .map(([x, y, flip]) => markUse(PIP, SUIT_MARKS[suit], x * W, y * H, size, ink, flip ? 180 : 0))
    .join("");
  return markDef(PIP, SUIT_MARKS[suit]) + classicPaper() + index + mirrored(index) + pips;
}

/** A court: the paper, both indices, and the engraving seated inside the grey rule. */
function classicCourt(rank: string, suit: SuitName, ink: string, style: DeckStyle, figure: string | undefined): string {
  const index = classicIndex(rank, suit, ink, style);
  const art = figure ? inlineFigure(figure, ACCENT_PAINT[accentOf(suit, style)]) : "";
  return markDef(PIP, SUIT_MARKS[suit]) + classicPaper() + art + index + mirrored(index);
}

/**
 * The classic joker: the word small in both corners — no suit, so no pip — and the hat at centre
 * in the joker's own ink. «Джокер» runs smaller: at the Latin size it reaches the far corner.
 */
function classicJoker(ink: string, style: DeckStyle): string {
  const word = jokerWord(style);
  const size = W * (style.cyrillic ? 0.055 : 0.075);
  const corner = lettering(word, W * 0.09, W * 0.08, size, ink);
  return classicPaper() + corner + mirrored(corner) + markAt(JOKER_HAT, W / 2, H / 2, W * 0.56, W * 0.42, ink);
}

// ---------------------------------------------------------------- minimal

/** The kit's card: the keyline, a cream margin, a fainter rule closer in. */
function minimalPaper(): string {
  return (
    keyline(PAPER.stock) +
    paperRect(px(4.5), `fill="none" stroke="${PAPER.black}" stroke-opacity="0.14" stroke-width="${px(1)}"`)
  );
}

/** One index in the corner, one mark at centre — a court is a letter like any number. */
function minimalFace(rank: string, suit: SuitName, ink: string, style: DeckStyle): string {
  const size = W * 0.19;
  const pip = W * 0.17;
  const gap = px(2);
  const label = rankLabel(rank, style);
  const column = Math.max(textWidth(label, size), pip);
  const cx = W * 0.15 + column / 2;
  const top = W * 0.12;
  const mark = SUIT_MARKS[suit];
  return (
    markDef(PIP, mark) +
    minimalPaper() +
    lettering(label, cx - textWidth(label, size) / 2, top, size, ink) +
    markUse(PIP, mark, cx, top + size + gap + pip / 2, pip, ink) +
    markUse(PIP, mark, W / 2, H / 2, W * 0.46, ink)
  );
}

/** The minimal joker: the word at the top, the hat at centre, the word again at the bottom, turned. */
function minimalJoker(ink: string, style: DeckStyle): string {
  const word = jokerWord(style);
  const size = W * (style.cyrillic ? 0.082 : 0.11);
  const pad = W * 0.11;
  const x = (W - textWidth(word, size)) / 2;
  const top = lettering(word, x, pad, size, ink);
  const bottom = `<g transform="rotate(180 ${W / 2} ${H / 2})">${top}</g>`;
  return minimalPaper() + top + markAt(JOKER_HAT, W / 2, H / 2, W * 0.5, W * 0.38, ink) + bottom;
}

/** The brand: its label's words, one above the other, a red rule between — centred on the paper. */
function brand(spec: CardSpec): string {
  const [first = "", second = ""] = spec.label.toUpperCase().split(" ");
  const size = W * 0.09;
  const gap = W * 0.12;
  const rule = W * 0.02;
  const top = H / 2 - size - gap / 2;
  const line = (word: string, y: number): string => lettering(word, (W - textWidth(word, size)) / 2, y, size, PAPER.black);
  const ruleWidth = textWidth(first, size);
  return (
    line(first, top) +
    `<rect x="${fmt((W - ruleWidth) / 2)}" y="${fmt(H / 2 - rule / 2)}" width="${fmt(ruleWidth)}" height="${fmt(rule)}" fill="${PAPER.red}"/>` +
    line(second, H / 2 + gap / 2)
  );
}

/** Exposed for the tests and the skin: which ranks are courts under the classic layout. */
export function isCourt(spec: CardSpec): boolean {
  return spec.kind === "pip" && COURT_RANKS.has(spec.values["rank"]!);
}

/** The corner radius in units — the skin clips a face to the paper's own corner. */
export const FACE_RADIUS_UNITS = R / W;
