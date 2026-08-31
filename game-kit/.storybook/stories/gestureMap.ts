// GESTURES / THE MAP — the desk the gesture scenes are played on, and the pieces on it.
//
// A gesture page used to hold one square, and for `Hold` and `Tap` that is still right: those two
// pages are about a PRESS, and a press has nothing to do with what is under it. A grab does. The
// finger picks a thing up and carries it somewhere, so the page has to have things worth carrying
// and somewhere to carry them TO — otherwise "it follows the hand" is the whole lesson, and the
// hand never leaves the middle of the glass.
//
// So the scene is a MAP, bigger than the glass, looked at through a camera: pan it, zoom it, and
// move the pieces about on it. The pieces are deliberately three different KINDS — a pair of cards
// from the cards add-on, a die from the dice add-on, and a knight drawn here — because a carry that
// only ever holds a card teaches the card, not the carry. They come in three sizes and three
// silhouettes, and every one of them answers to the same finger.
//
// The knight is drawn here, as SVG text, for the reason the stock pictures are: the kit ships no
// art, and a binary in the repository is a thing nobody can read in a diff. Its colours are CSS
// names, not theme tokens — a piece is content, and it does not follow the theme.

import {
  add,
  Bounded,
  caps,
  compose,
  Container,
  Draggable,
  extentOf,
  fieldsOf,
  freeLayout,
  node,
  rect,
  registerAsset,
  reorder,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  type BoundedFields,
  type Node,
  type Walls,
} from "../../src/index.js";
import { deckByCardId } from "@game-presets/cards";
import { die } from "@game-presets/dice";
import { svg } from "./stockAssets.js";

/** How big the map is, in units — see `gestureMap` on why it is bigger than any glass. */
export const MAP = { w: 8, h: 8 };

/** The knight's own box, in units — a chess piece stands taller than it is wide. */
const KNIGHT = { w: 0.9, h: 1.1 };

const GRID = "gesture.map.grid";
const MAP_SURFACE = "gesture.map";
const KNIGHT_SURFACE = "gesture.map.knight";

/**
 * ONE UNIT OF GRID, repeated — the whole of "the map moved" for an eye that has nothing else to
 * measure against. A tile and not a hundred plate nodes: the ground is one node either way, and a
 * repeat costs the plan nothing per line.
 */
const GRID_TILE = svg(100, 100, '<path d="M0 0 H100 M0 0 V100" fill="none" stroke="slategray" stroke-width="2"/>');

/**
 * THE KNIGHT, facing left: a base, a chest, the muzzle and one ear, drawn as a single filled
 * outline with the eye on top of it. Wheat on a dark map, so it reads at a glance beside two white
 * cards and a white die without being a fourth white thing.
 */
const KNIGHT_PIECE = svg(
  100,
  120,
  [
    '<path d="M25 113 L75 113 L75 105 C75 99 71 95 65 92 C73 84 78 73 78 60',
    'C78 44 70 31 56 23 L52 8 L45 19 L37 13 L33 30 C22 39 16 49 16 58',
    'C16 63 19 66 24 65 L38 59 L33 68 C29 76 27 84 27 93 C27 99 26 102 25 105 Z"',
    'fill="wheat" stroke="saddlebrown" stroke-width="3" stroke-linejoin="round"/>',
    '<circle cx="34" cy="44" r="4" fill="saddlebrown"/>',
    '<path d="M46 22 C58 30 66 41 68 54" fill="none" stroke="saddlebrown" stroke-width="3" stroke-linecap="round"/>',
  ].join(" "),
);

/** Register everything the map's nodes point at by name. Idempotent — a re-render calls it again. */
function installMapArt(): void {
  registerAsset(GRID, { src: GRID_TILE, w: 1, h: 1 });
  registerAsset(KNIGHT_SURFACE, { src: KNIGHT_PIECE, w: KNIGHT.w, h: KNIGHT.h });
  registerLayout("gesture.map.free", freeLayout);
  registerSurface(MAP_SURFACE, {
    layers: [{ paint: "sunkBg" }, { image: GRID, fit: "repeat", opacity: 0.35 }],
    radius: 0.2,
    // The map's own edge, so the bound the camera stops at is a thing the eye can see it reach.
    stroke: { color: "panelBorder", width: 0.04 },
  });
  // The piece is the picture and nothing else: no plate under it, so its silhouette is what the
  // eye follows across the map.
  registerSurface(KNIGHT_SURFACE, { layers: [{ image: KNIGHT_SURFACE, fit: "contain" }] });
}

/**
 * A PIECE PUT DOWN STAYS PUT. Nothing on this map accepts a drop, so every release is a refused
 * one — and on a map the stock `home` would mean a piece flying back the moment the hand let go of
 * it somewhere it was meant to be.
 */
const PUT_DOWN = Draggable({ onReject: "stay" });

/**
 * The map, with its four pieces on it — two cards, a d6 and a knight, laid out around the middle so
 * a phone in portrait holds all four at once and the first gesture has something to reach for.
 */
export function gestureMap(): Node {
  installMapArt();
  const desk = node(
    "map",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: "gesture.map.free" }),
    Surfaced({ surface: MAP_SURFACE }),
  );
  const by = deckByCardId();
  const seats: readonly (readonly [string, { x: number; y: number }])[] = [
    ["spade-A", { x: -1.1, y: -1.5 }],
    ["heart-10", { x: 0.3, y: -1.4 }],
  ];
  for (const [id, at] of seats) {
    const card = by.get(id)!;
    compose(card, Transformable({ at }));
    compose(card, PUT_DOWN);
    add(desk, card);
  }
  const d6 = die("die", { kind: "d6", at: { x: -1.1, y: 0.5 }, face: 5 });
  // The add-on's die is draggable already; what it has no opinion about is where a refused drop
  // leaves it, and on a map that answer is "where you put it".
  compose(d6, PUT_DOWN);
  add(desk, d6);
  add(
    desk,
    node(
      "knight",
      Bounded({ bounds: rect(KNIGHT.w, KNIGHT.h) }),
      Surfaced({ surface: KNIGHT_SURFACE }),
      Transformable({ at: { x: 0.7, y: 1.2 } }),
      PUT_DOWN,
    ),
  );
  return desk;
}

/**
 * THE MAP'S OWN BORDER, as the tray a carried piece may not be taken out of.
 *
 * The walls clamp the ANCHOR — the piece's origin — so they are the map inset by the piece's own
 * half: clamp the origin to the map's edge instead and half the card hangs over the side. Asked per
 * piece, because the four pieces are four sizes and one number could only be right for one of them.
 *
 * `lift` is the pop the carry is holding it at: a piece drawn six percent bigger is six percent
 * wider than the tree says it is, and a border that ignored that would let exactly that sliver of
 * card cross it. Pass `1` for a carry with no pop.
 */
export function mapWalls(piece: Node, lift = 1): Walls {
  const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
  const size = shape ? extentOf(shape) : { w: 0, h: 0 };
  const x = MAP.w / 2 - (size.w * lift) / 2;
  const y = MAP.h / 2 - (size.h * lift) / 2;
  // A piece bigger than the map has nowhere to stand: the box collapses to the middle rather than
  // turning inside out, which is what a negative half would do.
  return { x0: Math.min(-x, 0), y0: Math.min(-y, 0), x1: Math.max(x, 0), y1: Math.max(y, 0) };
}

/** What a piece does once the hand lets go of it — how it comes down, and how it comes off a wall. */
export interface DropFeel {
  /** Units/s² — how heavy it is. A big number is a short, hard fall. */
  readonly gravity: number;
  /** 0..1 of the landing speed handed back. `0` lands and stays. */
  readonly bounce: number;
  /**
   * 0..1 of the speed a WALL hands back. Its own number, and not the desk's: a felt and a rail are
   * not the same material, and it is the pair that says what a piece is made of — a card is dead on
   * the cloth and still comes off a border.
   */
  readonly wallBounce: number;
}

/**
 * WHAT A PIECE DOES WHEN IT IS LET GO OF — read off what the piece IS, never off its name.
 *
 * A die is the thing with faces to go over (`Rollable`); a card is the thing with a back to turn to
 * (`Flippable`); a carved piece is neither, which is exactly what a chess piece is on this desk. So
 * the answer comes from the model, and a fourth piece added tomorrow is sorted by what it carries
 * rather than by somebody remembering to add it to a list — which is also the only reading
 * `guard.id-is-opaque` allows: an id says WHICH, never WHAT.
 */
export function dropOf(piece: Node): DropFeel {
  // A DIE IS THROWN DOWN, and the desk throws it back: hard, fast, and it hops before it settles.
  // Thrown, it is also the liveliest thing off a border: hard, light for its size, and the only
  // piece here anybody expects to come back across the desk at them.
  if (caps(piece).has("Rollable")) return { gravity: 22, bounce: 0.45, wallBounce: 0.7 };
  // A CARD TAKES ITS TIME — it is the lightest thing on the desk and the only one with enough face
  // to catch air. Slower than the other two and not SLOW: at a quarter of the die's pull it hung in
  // the air for over a second, which reads as a page loading rather than as a card falling. Two
  // thirds of it is a fall you can see is gentler without waiting for it. Paper does not bounce.
  // Off a wall it does come back, though — it is dead on the cloth, not dead altogether.
  if (caps(piece).has("Flippable")) return { gravity: 8, bounce: 0, wallBounce: 0.45 };
  // A CARVED PIECE lands like the lump of wood it is: as fast as the die, and it taps ONCE.
  //
  // A quarter and not a tenth, because a bounce gives back the SQUARE of it in height: at `0.08` the
  // piece came back up by four thousandths of a unit — a fifth of a pixel, which is a landing nobody
  // can see and therefore not a landing at all. A quarter is one small, quick tick, against the die's
  // two clear hops.
  // And against a rail it is the deadest of the three: weight is what a wall takes out of a piece.
  return { gravity: 26, bounce: 0.25, wallBounce: 0.2 };
}

/**
 * PUT A PIECE ON TOP of everything else on the desk — the last thing dropped covers what is under it.
 *
 * Tree order, and not a height: equal `z` keeps the order the children stand in (the plan sorts
 * stably), so "in front" is a place in the list. Written as a height it would be a lie about the
 * third dimension — the piece is ON the desk, not hovering over it — and every drop would raise the
 * pile a little further off the felt forever.
 */
export function toFront(piece: Node): void {
  const owner = piece.parent;
  if (!owner) return;
  const i = owner.children.indexOf(piece);
  if (i < 0 || i === owner.children.length - 1) return;
  reorder(owner, [...owner.children.keys()].filter((k) => k !== i).concat(i));
}
