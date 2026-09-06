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
  heapsOf, heapBox, regrip, regrasp, TOUCHING, type HeapRule, type GripSpec, GRIP_RATIO, GRIP, GRIP_HOLD, GRIP_GAP, GRIP_MISS, GRIP_SPEC, isPlaceGrip, isGrip, isMark, isDrawn,

  CARRY_CLEAR,
  landingMark,
  landingAt,
  landingBox,

  add,
  apply,
  Bounded,
  caps,
  circle,
  compose,
  Container,
  extentOf,
  facing,
  fieldsOf,
  Forgiving,
  islands,
  node,
  outlineOf,
  outlinesTouch,
  placedOutline,
  polar,
  rect,
  registerAsset,
  registerSurface,
  remove,
  reorder,
  roundedRect,
  Screened,
  setFacing,
  stackSeats,
  Private,
  Surfaced,
  svg,
  Transformable,
  transformsOf,
  type Node,
  type TransformableFields,
  type ValuedFields,
  type Vec,
  type Walls,
  Valued,
} from "../../src/index.js";
// The numbers and seats of a fall are the KIT'S (`render/fall.ts`) — re-exported so every page and
// test on this shelf keeps its import, and there is one value per name and not two that drift.
export { heapsOf, heapBox, regrip, regrasp, TOUCHING, type HeapRule, type GripSpec, GRIP_RATIO, GRIP, GRIP_HOLD, GRIP_GAP, GRIP_MISS, GRIP_SPEC, isPlaceGrip, isGrip, isMark, isDrawn };
export { DIE_FAN, DIE_HOP, DIE_SCATTER, DIE_SPIN, DIE_SPIN_DRAG, STACK_FALL_STEP, STACK_POUR, STACK_STEP, STACK_THICK, stackSeats, toFront } from "../../src/index.js";

export {
  alsoInTheWay,
  bumped,
  dropOf,
  fallOrder,
  flickOf,
  flightOf,
  flockTo,
  mapWalls,
  restsAt,
  roomBy,
  shoves,
  threwAt,
  thrown,
  THROW_REACH,
  THROWN_AT,
  type Bump,
  type DropFeel,
  type LetGo,
} from "../../src/index.js";

import { cards as crossadeCards, deckByCardId } from "@game-presets/cards";
import { die } from "@game-presets/dice";
// THE MAP'S OWN FELT moved to `@game-presets/desks` — a preset add-on, as `installMapArt`'s pieces
// (the knight, the grid, the grip handle) are shared furniture for a shelf of sandbox desks and not
// the kit's own. Imported back and re-exported, so every page and test on this shelf keeps its
// import and there is one value per name and not two that drift.
import { ANCHOR_MARK, CASTS, deskRoom, installMapArt, KNIGHT, KNIGHT_SURFACE, LAMP, MAP, MAP_SURFACE, onTheDesk, PUT_DOWN, ROAM, zoneKeen, zoneLine } from "@game-presets/desks";
export { ANCHOR_MARK, CASTS, deskRoom, installMapArt, LAMP, MAP, onTheDesk, PUT_DOWN, ROAM, zoneKeen, zoneLine };

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
    LAMP,
  );
  const by = deckByCardId();
  const seats: readonly (readonly [string, { x: number; y: number }])[] = [
    ["spade-A", { x: -1.1, y: -1.5 }],
    ["heart-10", { x: 0.3, y: -1.4 }],
  ];
  for (const [id, at] of seats) {
    const card = by.get(id)!;
    compose(card, Transformable({ at }));
    onTheDesk(card);
    add(desk, card);
  }
  const d6 = die("die", { kind: "d6", at: { x: -1.1, y: 0.5 }, face: 5 });
  // The add-on's die is draggable already; what it has no opinion about is where a refused drop
  // leaves it, and on a map that answer is "where you put it".
  onTheDesk(d6);
  add(desk, d6);
  add(
    desk,
    node(
      "knight",
      Bounded({ bounds: rect(KNIGHT.w, KNIGHT.h) }),
      Surfaced({ surface: KNIGHT_SURFACE }),
      Transformable({ at: { x: 0.7, y: 1.2 } }),
      PUT_DOWN,
    CASTS,
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


/**
 * ABOVE THIS SPEED A RELEASE IS A THROW — GLASS PIXELS PER SECOND, because that is what a finger
 * moves in. Whatever the piece's ordinary way of leaving is.
 *
 * `settle` is a putting-down, and a putting-down is a thing a slow hand does. Read as "this piece
 * can never be thrown" it would mean a card flicked across the desk simply appearing where the
 * finger stopped, which is not a card and not a throw. So the way a piece leaves is its DEFAULT,
 * and a hand moving faster than this overrules it.
 *
 * ON THE GLASS AND NOWHERE ELSE. Said in units of desk, this number means a different gesture on
 * every view: zoomed out to deal a hand, the same unhurried pass over the same screen crosses two
 * or three times the desk it crossed before, so a carry became a throw because the camera moved.
 * A flick is a property of a hand and a screen, and the screen is where it is measured.
 */



// ---- THE STACKING DESK ------------------------------------------------------------------------
//
// The same map with a heap's worth of pieces on it: six cards, six chips of one denomination, one
// die, and NOTHING touching anything to begin with. Touching is the whole subject of the page, so
// the scene must open with none of it — a desk that starts with a heap already on it teaches the
// heap and not how one comes about.

/** The chip's own box, in units — a token you can cover with a thumb. */
const CHIP = 0.5;
const CHIP_SURFACE = "gesture.map.chip";

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

/**
 * How close is TOUCHING, in units. Not zero: to a player two cards a hair apart on a felt are
 * touching, and a heap that would not form until the pixels met would read as broken.
 */
const TOUCH_SLACK = 0.04;

/** The chip is the stacking desk's alone; the handle is every desk's, and lives with the map's art. */
function installStackArt(): void {
  registerAsset(CHIP_SURFACE, { src: CHIP_PIECE, w: CHIP, h: CHIP });
  registerSurface(CHIP_SURFACE, { layers: [{ image: CHIP_SURFACE, fit: "contain" }] });
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
    CASTS,
  );
}

/**
 * WHAT A PIECE IS, off what it carries and never off its name — `guard.id-is-opaque`, which caught
 * this file reading `id.startsWith` the first time it was written.
 *
 * A die rolls, a card turns over, a chip states a denomination and a handle states that it is one.
 * A fifth piece added tomorrow is sorted by what it has, not by somebody remembering a list.
 */
export type Piece = "die" | "card" | "chip" | "grip" | "mark" | "warm" | "";

export function heapKindOf(n: Node): string {
  const k = kindOf(n);
  return k === "card" || k === "chip" ? k : "";
}

export function kindOf(n: Node): Piece {
  if (caps(n).has("Rollable")) return "die";
  if (caps(n).has("Flippable")) return "card";
  const values = fieldsOf<ValuedFields>(n, "Valued")?.values;
  if (values?.["warm"] !== undefined) return "warm";
  if (values?.["grip"] !== undefined) return "grip";
  if (values?.["mark"] !== undefined) return "mark";
  if (values?.["chip"] !== undefined) return "chip";
  return "";
}






/**
 * THE PICTURE OF WHERE THIS RUN WILL COME DOWN — a card-shaped outline, standing on the felt under
 * the hand that is holding the run.
 *
 * Because a hand carrying a stack is holding it in the AIR, and the air is not where it lands. The
 * cards ride at the hand's height, splayed, a card's width above the tab; the tab travels flat on
 * the felt at the point the run is anchored on. Neither of those is the answer to "where will this
 * stack STAND", and a player carrying thirty-six cards across a desk was being asked to work it out.






/** The handle for one heap: a wide low tab under the middle of everything the heap covers. */



/**
 * THE HANDLES ALREADY ON THE DESK, paired with the heaps they stand for — for a screen that did not
 * draw them.
 *
 * Two screens over one tree is two screens over one set of tabs, and only one of them can have put
 * them there: `regrip` throws every handle away and makes it afresh, so a second screen calling it
 * destroys the very tab the first screen's finger is about to land on. The map it kept then points
 * at ids that are no longer in the tree, `runOf` finds nothing under the tab, and the handle sails
 * off across the desk carrying nothing at all. Which is exactly what it did.
 *
 * So a screen that did not draw the tabs does not redraw them: it reads the ones that are there and
 * pairs them with the heaps, in the order `regrip` makes both — places first, then islands. The
 * order is the correspondence, and it is the same order on every screen because it is the same tree.
 */

/** The stacking desk: six cards, six chips and a die, laid out so nothing touches anything. */
export function stackMap(): Node {
  installMapArt();
  installStackArt();
  const desk = node(
    "map",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: "gesture.map.free" }),
    Surfaced({ surface: MAP_SURFACE }),
    LAMP,
  );
  const by = deckByCardId();
  // Two rows of three, a fifth of a unit of felt showing between every pair — near enough to push
  // together with one finger, far enough that the desk opens with no heap on it at all.
  const cards = ["spade-A", "spade-Q", "heart-10", "diamond-7", "club-K", "heart-2"];
  cards.forEach((id, i) => {
    const card = by.get(id)!;
    compose(card, Transformable({ at: { x: -1.3 + (i % 3) * 1.3, y: i < 3 ? -2.6 : -1.0 } }));
    onTheDesk(card);
    add(desk, card);
  });
  for (let i = 0; i < 6; i++) {
    add(desk, chip(`chip ${i}`, { x: -0.7 + (i % 3) * 0.7, y: i < 3 ? 0.4 : 1.1 }));
  }
  const d6 = die("die", { kind: "d6", at: { x: 1.7, y: 0.75 }, face: 5 });
  onTheDesk(d6);
  add(desk, d6);
  return desk;
}




// ---- THE DECK DESK ----------------------------------------------------------------------------

/** How many cards this desk plays with, and how many of them start out in the open. */
export const DECK = { cards: 36, dealt: 6 };

/**
 * A DESK WITH A CLOSED DECK ON IT — six cards face up, the rest stacked face down in one place.
 *
 * The pile is not a special kind of thing: it is thirty cards lying on the same spot, which is to
 * say a heap, which is to say every rule this desk already has. It gets a handle like any other
 * heap, it is picked up like any other heap, and a finger on it lands on the topmost card drawn —
 * which is the top of the deck. That is the whole of "tapping the deck turns its top card over":
 * nothing about a deck had to be written, because a deck is not a thing here, it is an arrangement.
 */
export function deckMap(): Node {
  installMapArt();
  const desk = node(
    "map",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: "gesture.map.free" }),
    Surfaced({ surface: MAP_SURFACE }),
    LAMP,
  );
  const all = crossadeCards().slice(0, DECK.cards);
  all.forEach((card, i) => {
    const open = i < DECK.dealt;
    // The six in the open lie in two rows of three; the rest are one pile, each card a hair off the
    // one below so the stack has a thickness the eye can see.
    const at = open
      ? { x: -1.3 + (i % 3) * 1.3, y: i < 3 ? -2.6 : -1.05 }
      : { x: 1 + (i - DECK.dealt) * 0.004, y: 1.2 - (i - DECK.dealt) * 0.012 };
    compose(card, Transformable({ at }));
    onTheDesk(card);
    // Face up in the open, face down in the deck — the atom's own word, and the only thing that
    // makes the pile a CLOSED one.
    setFacing(card, open ? "up" : "down");
    add(desk, card);
  });
  return desk;
}

/** Turn a card over: the truth, and the picture follows it (`Flippable` owns the reflection). */
export function turnOver(card: Node): void {
  setFacing(card, facing(card) === "up" ? "down" : "up");
}
