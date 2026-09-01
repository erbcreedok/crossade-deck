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
  apply,
  Bounded,
  caps,
  circle,
  compose,
  Container,
  Draggable,
  extentOf,
  fieldsOf,
  islands,
  outlineOf,
  outlinesTouch,
  placedOutline,
  remove,
  roundedRect,
  Screened,
  transformsOf,
  freeLayout,
  node,
  rect,
  registerAsset,
  reorder,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  Valued,
  type BoundedFields,
  type Node,
  type ValuedFields,
  type Vec,
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
  // A CARVED PIECE DOES NOT BOUNCE. It lands like the lump of wood it is — as fast as the die, and
  // then it is simply there.
  //
  // A thousandth and not a quarter, and the number is the owner's own word: a tenth of a percent is
  // "not at all" written down, and it is written down rather than left at zero so that the ORDER of
  // the three still says something — a die is lively, a card is fair, and a carved piece is the end
  // of the scale rather than a piece the scale forgot. Nobody will see it, which is the point.
  return { gravity: 26, bounce: 0.001, wallBounce: 0.001 };
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


// ---- THE STACKING DESK ------------------------------------------------------------------------
//
// The same map with a heap's worth of pieces on it: six cards, six chips of one denomination, one
// die, and NOTHING touching anything to begin with. Touching is the whole subject of the page, so
// the scene must open with none of it — a desk that starts with a heap already on it teaches the
// heap and not how one comes about.

/** The chip's own box, in units — a token you can cover with a thumb. */
const CHIP = 0.5;
const CHIP_SURFACE = "gesture.map.chip";
const GRIP_SURFACE = "gesture.map.grip";
const GRIP_RIDGES = "gesture.map.grip.ridges";

/** The one denomination on this desk — six of a kind, so what groups them is touching and not value. */
const CHIP_VALUE = 25;

/** A poker chip: the edge dashes anybody would draw, a ring, and the value in the middle. */
const CHIP_PIECE = svg(
  100,
  100,
  [
    '<circle cx="50" cy="50" r="48" fill="firebrick" stroke="whitesmoke" stroke-width="3"/>',
    // The six edge dashes are what makes a disc read as a CHIP rather than as a counter.
    '<circle cx="50" cy="50" r="44" fill="none" stroke="whitesmoke" stroke-width="11" stroke-dasharray="14 9.05"/>',
    '<circle cx="50" cy="50" r="33" fill="firebrick" stroke="whitesmoke" stroke-width="2"/>',
    `<text x="50" y="50" fill="whitesmoke" font-family="Georgia,serif" font-size="30" font-weight="bold" text-anchor="middle" dominant-baseline="central">${CHIP_VALUE}</text>`,
  ].join(""),
);

/** Three ridges — the mark every grab handle in every application wears, and the reason one is legible. */
const GRIP_BARS = svg(
  60,
  16,
  ["<g fill='slategray'>", ...[24, 30, 36].map((x) => `<rect x="${x}" y="4" width="2.6" height="8" rx="1.3"/>`), "</g>"].join(""),
);

/**
 * How big the grip's tab is, in units — wide and low, so it reads as a handle and hides nothing.
 *
 * The width is the number; the height follows it, because the SHAPE is what makes a tab read as one
 * and a tab that changed proportion with its size would stop being the same control.
 */
export const GRIP_RATIO = 4;
export const GRIP = { w: 0.6, h: 0.6 / GRIP_RATIO };
/**
 * How far the view may take the handle down before it is held, and how far up — see `Screened`.
 *
 * The ceiling is ONE and goes no higher: a handle has a size that suits the finger, and there is
 * nothing above it to want. Zoomed in, the desk grows and the tab stays the size it always was;
 * zoomed out, it is allowed to come down a little rather than tower over the heap it belongs to.
 */
export const GRIP_HOLD = { min: 0.8, max: 1 };
/** How far under the heap's own edge the tab sits, in units. */
const GRIP_GAP = 0.06;
/**
 * How far apart the pieces of a lifted stack stand, in units — the same trick `stackLayout` uses:
 * thickness is an `at` offset and never a `z`, or a heap would rise off the felt as it grew.
 */
export const STACK_STEP = { x: 0.012, y: -0.03 };
/**
 * How close is TOUCHING, in units. Not zero: to a player two cards a hair apart on a felt are
 * touching, and a heap that would not form until the pixels met would read as broken.
 */
const TOUCH_SLACK = 0.04;

function installStackArt(): void {
  registerAsset(CHIP_SURFACE, { src: CHIP_PIECE, w: CHIP, h: CHIP });
  registerAsset(GRIP_RIDGES, { src: GRIP_BARS, w: GRIP.w, h: GRIP.h });
  registerSurface(CHIP_SURFACE, { layers: [{ image: CHIP_SURFACE, fit: "contain" }] });
  // A HANDLE, not a marker: the kit's own plate colours, so it belongs to the desk rather than
  // shouting over it, and the ridges on top so it reads as something to pull at a glance.
  registerSurface(GRIP_SURFACE, {
    layers: [{ paint: "panelBg" }, { image: GRIP_RIDGES, fit: "contain" }],
    radius: GRIP.h / 2,
    stroke: { color: "panelBorder", width: 0.02 },
  });
}

/** One chip. Round, so what it touches is decided by its own outline and not by a square around it. */
function chip(id: string, at: Vec): Node {
  return node(
    id,
    Bounded({ bounds: circle(CHIP / 2) }),
    Surfaced({ surface: CHIP_SURFACE }),
    Transformable({ at }),
    Valued({ values: { chip: CHIP_VALUE } }),
    PUT_DOWN,
  );
}

/**
 * WHAT A PIECE IS, off what it carries and never off its name — `guard.id-is-opaque`, which caught
 * this file reading `id.startsWith` the first time it was written.
 *
 * A die rolls, a card turns over, a chip states a denomination and a handle states that it is one.
 * A fifth piece added tomorrow is sorted by what it has, not by somebody remembering a list.
 */
export type Piece = "die" | "card" | "chip" | "grip" | "";

export function kindOf(n: Node): Piece {
  if (caps(n).has("Rollable")) return "die";
  if (caps(n).has("Flippable")) return "card";
  const values = fieldsOf<ValuedFields>(n, "Valued")?.values;
  if (values?.["grip"] !== undefined) return "grip";
  if (values?.["chip"] !== undefined) return "chip";
  return "";
}

/** True for the pieces this desk lets form a heap together — a card with a card, a chip with a chip. */
export function sameKind(a: Node, b: Node): boolean {
  const k = kindOf(a);
  return (k === "card" || k === "chip") && k === kindOf(b);
}

/**
 * THE HEAPS ON THE DESK RIGHT NOW — every set of pieces of one kind joined by a chain of touches.
 *
 * The kit answers "do these two outlines overlap"; WHICH pieces are allowed to is this desk's rule
 * and lives here. Groups of one are dropped: a lone card is not a heap, and a handle under it would
 * be a control that does nothing.
 */
export function heapsOf(root: Node): Node[][] {
  const poses = transformsOf(root);
  const pieces = root.children.filter((n) => sameKind(n, n));
  const outline = new Map<string, ReturnType<typeof placedOutline>>();
  for (const n of pieces) {
    const shape = fieldsOf<BoundedFields>(n, "Bounded")?.bounds;
    const at = poses.get(n.id);
    if (shape && at) outline.set(n.id, placedOutline(outlineOf(shape), at));
  }
  const touch = (a: Node, b: Node): boolean => {
    const oa = outline.get(a.id);
    const ob = outline.get(b.id);
    return !!oa && !!ob && sameKind(a, b) && outlinesTouch(oa, ob, TOUCH_SLACK);
  };
  return islands(pieces.filter((n) => outline.has(n.id)), touch).filter((group) => group.length > 1);
}

/** A handle says so on itself. Its id is a NAME and nothing reads it — membership is looked up. */
export const isGrip = (n: Node): boolean => kindOf(n) === "grip";

/**
 * The box a heap covers, in root units — what "the common perimeter" means when the answer has to
 * be a place a handle can stand.
 */
export function heapBox(root: Node, group: readonly Node[]): { readonly mid: number; readonly bottom: number } {
  const poses = transformsOf(root);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of group) {
    const shape = fieldsOf<BoundedFields>(n, "Bounded")?.bounds;
    const at = poses.get(n.id);
    if (!shape || !at) continue;
    for (const p of placedOutline(outlineOf(shape), at)) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }
  return { mid: (x0 + x1) / 2, bottom: y1 };
}

/**
 * HOW MANY HANDLES HAVE EVER BEEN DRAWN — the next one's name, and never a name used before.
 *
 * A handle is a PICTURE of a heap, not a thing on the desk, and the difference is its identity. Named
 * by their place in the list, two handles swap names the moment a heap between them goes: the clock
 * sees one id whose rest pose has moved and eases it there, so every remaining tab slides along into
 * the one before it, and a new tab flies out of an old one's seat instead of appearing under its own
 * heap. Named afresh, each is a node the clock has never seen — and a new node is drawn at its rest
 * and does not fly in from nowhere (`motion.a-new-node-appears-without-flying`). It appears where it
 * belongs and goes where it stood.
 */
let handlesDrawn = 0;

export interface GripSpec {
  /** The tab's width in units; its height follows by `GRIP_RATIO`. */
  readonly w: number;
  /** How far the view may take it down and up before it is held — see `Screened`. */
  readonly min: number;
  readonly max: number;
}

const GRIP_SPEC: GripSpec = { w: GRIP.w, ...GRIP_HOLD };

/** The handle for one heap: a wide low tab under the middle of everything the heap covers. */
function gripFor(root: Node, group: readonly Node[], nth: number, spec: GripSpec): Node {
  const { mid, bottom } = heapBox(root, group);
  const h = spec.w / GRIP_RATIO;
  return node(
    `stack handle ${handlesDrawn++}`,
    Bounded({ bounds: roundedRect(spec.w, h, h / 2) }),
    Surfaced({ surface: GRIP_SURFACE }),
    Transformable({ at: { x: mid, y: bottom + GRIP_GAP + h / 2 } }),
    Valued({ values: { grip: nth } }),
    // A HANDLE IS SIZED FOR THE FINGER, not for the desk: the same pixels at every zoom, the way
    // every drag handle in every application anybody has ever used is drawn.
    Screened({ min: spec.min, max: spec.max }),
    Draggable({ onReject: "stay" }),
  );
}

/**
 * REBUILD THE HANDLES for whatever is touching right now, and say which pieces each one holds.
 *
 * Called after anything moves, because that is the only time the answer can have changed. The old
 * tabs go first: a handle is a picture of a heap, and a picture nobody redrew is a handle hanging
 * under a heap that has walked away from it.
 */
export function regrip(root: Node, spec: GripSpec = GRIP_SPEC): Map<string, readonly Node[]> {
  const held = new Map<string, readonly Node[]>();
  for (const old of root.children.filter(isGrip)) remove(root, old);
  heapsOf(root).forEach((group, i) => {
    const tab = gripFor(root, group, i, spec);
    add(root, tab);
    held.set(tab.id, group);
  });
  return held;
}

/**
 * Where each piece of a lifted heap stands, relative to the handle that lifted it.
 *
 * BY ITS BOTTOM CENTRE, not its middle. A handle is under a heap, and what is under a thing meets
 * it at its bottom edge — hung by their middles the pieces sit ON the tab with half of each below
 * it, which is a stack skewered on its own handle rather than one standing on it. The gap it stands
 * at is the gap it was DRAWN at (`GRIP_GAP`), so nothing moves relative to anything at the lift.
 */
export function stackSeats(group: readonly Node[], gripW = GRIP.w): Vec[] {
  const clear = gripW / GRIP_RATIO / 2 + GRIP_GAP;
  // `|| 0` folds the −0 that `0 * −step` yields at index 0 back to +0, exactly as `stackLayout`
  // does: a negative zero is a real coordinate footgun — it fails `Object.is` and leaks downstream.
  return group.map((piece, i) => {
    const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
    const half = shape ? extentOf(shape).h / 2 : 0;
    return { x: i * STACK_STEP.x || 0, y: -clear - half + i * STACK_STEP.y || 0 };
  });
}

/** The stacking desk: six cards, six chips and a die, laid out so nothing touches anything. */
export function stackMap(): Node {
  installMapArt();
  installStackArt();
  const desk = node(
    "map",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: "gesture.map.free" }),
    Surfaced({ surface: MAP_SURFACE }),
  );
  const by = deckByCardId();
  // Two rows of three, a fifth of a unit of felt showing between every pair — near enough to push
  // together with one finger, far enough that the desk opens with no heap on it at all.
  const cards = ["spade-A", "spade-Q", "heart-10", "diamond-7", "club-K", "heart-2"];
  cards.forEach((id, i) => {
    const card = by.get(id)!;
    compose(card, Transformable({ at: { x: -1.3 + (i % 3) * 1.3, y: i < 3 ? -2.6 : -1.0 } }));
    compose(card, PUT_DOWN);
    add(desk, card);
  });
  for (let i = 0; i < 6; i++) {
    add(desk, chip(`chip ${i}`, { x: -0.7 + (i % 3) * 0.7, y: i < 3 ? 0.4 : 1.1 }));
  }
  const d6 = die("die", { kind: "d6", at: { x: 1.7, y: 0.75 }, face: 5 });
  compose(d6, PUT_DOWN);
  add(desk, d6);
  return desk;
}


/**
 * How long apart the pieces of a dropped heap leave the hand, ms.
 *
 * Small on purpose: the whole stack still lands inside one fall, and what the eye reads is a POUR
 * rather than a queue. Wider and it stops being one thing coming down and becomes several things
 * dropped one after another, which is a different gesture.
 */
export const STACK_FALL_STEP = 55;

/**
 * WHO LEAVES THE HAND WHEN, for a run being let go of — the handle never, the rest a step apart.
 *
 * The bottom of the stack goes first and the top last, so the pieces land on top of what is already
 * down rather than under it, and the heap pours instead of dropping as a slab. A run of one has no
 * stagger to have: `0`, and the ordinary drop is unchanged, which is every other page on the shelf.
 *
 * A HANDLE IS NOT AMONG THEM. It is a control, and a control does not fall — it is redrawn under
 * wherever the pieces land.
 */
export function fallOrder(pieces: readonly Node[]): { readonly piece: Node; readonly delayMs: number }[] {
  return pieces.filter((n) => !isGrip(n)).map((piece, i) => ({ piece, delayMs: i * STACK_FALL_STEP }));
}
