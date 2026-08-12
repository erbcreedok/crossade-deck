// SUITS — the four marks of a playing set, as VECTOR SHAPES the skin later lays out into pips and
// corner indices. Geometry only: each suit is ONE closed outline (a `Shape`, the engine's single
// path type) plus the paint it wears. No raw colour is spelled here — a red suit is the parametric
// `spin` hue, a black one is the theme's ink token, and the hexes stay in the engine's theme alone.
//
// Authored as pasted SVG `d` strings — the way a mark actually arrives from Figma — and parsed by
// the engine's `fromSvgPath`. Arcs are not in the vocabulary (every curve is a cubic), so the marks
// are drawn with C/L only. Units are centred on the origin in a ~1×1 box; the skin scales them.

import { fromSvgPath, polyline, type Paint, type Shape } from "game-kit";

export type SuitName = "spade" | "heart" | "diamond" | "club";
/** The set's ordered colour field — red or black, the value a rule and a sort read. */
export type SuitColor = "red" | "black";

export interface Suit {
  readonly name: SuitName;
  /** One closed outline, centred on the origin. */
  readonly shape: Shape;
  /** How it is painted: `spin` at the red hue, or the ink token for black. */
  readonly paint: Paint;
  /** The colour class, as the set's ordered field value. */
  readonly color: SuitColor;
}

// `spin` at 0 is the top of the hue wheel — red. Both red suits wear the SAME hue: a set has one
// red, exactly as the engine's theme has one gold. Black is the ink token, resolved per theme.
const RED: Paint = { token: "spin", param: 0 };
const INK: Paint = "text";

/** Parse an authored path, loudly: a mark that did not parse is an authoring bug, not a blank pip. */
function pathShape(d: string): Shape {
  const shape = fromSvgPath(d);
  if (!shape) throw new Error(`suit path did not parse (arcs are unsupported): ${d}`);
  return shape;
}

const HEART = pathShape(
  "M0,0.5 C-0.25,0.15 -0.5,-0.1 -0.5,-0.28 C-0.5,-0.5 -0.18,-0.55 0,-0.2 C0.18,-0.55 0.5,-0.5 0.5,-0.28 C0.5,-0.1 0.25,0.15 0,0.5 Z",
);
const SPADE = pathShape(
  "M0,-0.5 C0.30,-0.12 0.52,0.10 0.50,0.30 C0.48,0.48 0.22,0.52 0.06,0.36 L0.18,0.52 L-0.18,0.52 L-0.06,0.36 C-0.22,0.52 -0.48,0.48 -0.50,0.30 C-0.52,0.10 -0.30,-0.12 0,-0.5 Z",
);
const CLUB = pathShape(
  "M0,-0.46 C0.26,-0.46 0.30,-0.10 0.10,-0.02 C0.20,-0.14 0.50,-0.06 0.50,0.14 C0.50,0.34 0.22,0.36 0.08,0.22 C0.14,0.34 0.16,0.46 0.22,0.54 L-0.22,0.54 C-0.16,0.46 -0.14,0.34 -0.08,0.22 C-0.22,0.36 -0.50,0.34 -0.50,0.14 C-0.50,-0.06 -0.20,-0.14 -0.10,-0.02 C-0.30,-0.10 -0.26,-0.46 0,-0.46 Z",
);
const DIAMOND = polyline([
  { x: 0, y: -0.5 },
  { x: 0.34, y: 0 },
  { x: 0, y: 0.5 },
  { x: -0.34, y: 0 },
]);

const spade: Suit = { name: "spade", shape: SPADE, paint: INK, color: "black" };
const heart: Suit = { name: "heart", shape: HEART, paint: RED, color: "red" };
const diamond: Suit = { name: "diamond", shape: DIAMOND, paint: RED, color: "red" };
const club: Suit = { name: "club", shape: CLUB, paint: INK, color: "black" };

/** The four, in the set's canonical order: spade, heart, diamond, club. */
export const SUITS: readonly Suit[] = [spade, heart, diamond, club];

/** A suit by name, or `undefined` — a dangling name draws nothing, it never throws. */
export function suitByName(name: SuitName): Suit | undefined {
  return SUITS.find((suit) => suit.name === name);
}
