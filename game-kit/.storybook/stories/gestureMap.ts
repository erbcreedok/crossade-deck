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
  facing,
  fieldsOf,
  Forgiving,
  freeLayout,
  installStockCoats,
  islands,
  Lit,
  node,
  outlineOf,
  outlinesTouch,
  placedOutline,
  polar,
  rect,
  registerAsset,
  registerLayout,
  registerSurface,
  remove,
  reorder,
  roundedRect,
  Screened,
  setFacing,
  ShadowCaster,
  stackSeats,
  Private,
  Surfaced,
  surfaceNames,
  surfaceRecord,
  Transformable,
  transformsOf,
  type BoundedFields,
  type Coat,
  type Node,
  type Paint,
  type Stroke,
  type TransformableFields,
  type ValuedFields,
  type Vec,
  type Walls,
  Valued,
} from "../../src/index.js";
// The numbers and seats of a fall are the KIT'S (`render/fall.ts`) — re-exported so every page and
// test on this shelf keeps its import, and there is one value per name and not two that drift.
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
import { svg } from "./stockAssets.js";

/** How big the map is, in units — see `gestureMap` on why it is bigger than any glass. */
export const MAP = { w: 8, h: 8 };

/**
 * HOW MUCH ROOM BEYOND THE DESK THE CAMERA IS GIVEN, as a fraction of the desk's own size.
 *
 * A camera told the desk EXACTLY is held so that the desk always covers the glass, and the felt's
 * edge becomes a wall the view stops dead against. That is correct and it is horrible to use: every
 * pan ends in a stop with nothing on the other side of it, and a piece lying by the border can never
 * be brought to the middle of the glass to be looked at. What the view is FOR is looking, and looking
 * at the edge of a thing means having a little of the outside in shot.
 *
 * A FRACTION and not a number of units, so it says the same thing about any desk this shelf grows —
 * a quarter of a desk of slack reads the same on one twice the size.
 *
 * IT MOVES NOTHING BUT THE VIEW. The desk's border is still a wall to the PIECES (`mapWalls`): the
 * slack is somewhere to look from, never somewhere to put anything.
 */
/**
 * HOW A DROP ZONE STANDS WHEN NOTHING IS OVER IT — its owner's colour, dashed, and quiet.
 *
 * TWO DIFFERENT SENTENCES, and a solid border says the wrong one. A zone drawn in a hard line is
 * claiming something at every moment of the game, and what it is actually saying is only "this
 * patch is somebody's" — a label, not an event. Said in a solid stroke it reads as the zone being
 * ON, so when the zone really does light up there is nothing left for it to change into.
 *
 * DASHED is what makes it a label. A broken line is a boundary drawn on the felt rather than a
 * thing standing on it, which is exactly what an area is; and it leaves the whole of "solid" free
 * to mean the one thing worth an event — this is the one that will take the card.
 *
 * IN UNITS, so the dashes are the same size on a desk of any zoom and there are simply more of them
 * around a bigger area: a pattern that scaled would be a picture of a border rather than a border.
 */
export function zoneLine(ink: Paint): Stroke {
  return { color: ink, width: 0.035, opacity: 0.55, dash: { on: 0.2, off: 0.16, corner: "dash" } };
}

/**
 * ...AND WHAT IT WEARS WHILE THE HAND IS OVER IT — the same colour, solid, and loud.
 *
 * A RING, because a ring is a STROKE and a stroke replaces the surface's own border for as long as
 * it is worn: the dashed label becomes one unbroken line and goes back to dashes when the hand
 * moves on. One outline, two states, and nothing on the glass has to be added or taken away.
 *
 * The same ink as the quiet line, on purpose. A zone that lit up in a different colour would be
 * answering a different question — the reader would have to learn which colour meant "yours" and
 * which meant "taking it", when the only thing that changed is that this one is taking it.
 */
export function zoneKeen(ink: Paint): Coat {
  return { recipe: "ring", level: 0.75, tint: ink };
}

/**
 * WHAT THE ANCHOR WEARS WHILE ITS RUN IS IN THE AIR — the mark that says WHERE THIS LANDS.
 *
 * The anchor is already on the glass and already in the right place: a handle takes no lift, so
 * while the cards ride at the hand's height the tab travels flat on the felt, exactly at the point
 * the run is going to come down on. What it did not do is READ as that. It looks like the control
 * it was a moment ago — the thing you took hold of — so a player carrying a stack watches the
 * CARDS to guess where they will land, and the cards are the one thing that is not where they will
 * land: they are a hand's width above the anchor and splayed.
 *
 * QUIET, because it is a target and not an announcement. A ring at a low level, in the muted ink:
 * enough that the eye finds it under a moving hand, not so much that it competes with the zone
 * lighting up — which is the thing that actually has news in it.
 */
export const ANCHOR_MARK: Coat = { recipe: "ring", level: 0.35, tint: "textMuted" };

export const ROAM = 0.25;

/**
 * THE STRETCH A CAMERA ON THIS SHELF IS HELD INSIDE — the desk, and `ROAM` of it all round.
 *
 * A RECT and not a size, because the desk is laid out AROUND zero: its corner is at minus half, and
 * a camera told only the size would hold the view inside one quarter of it while every clamp read
 * perfectly correct.
 */
export function deskRoom(box: { w: number; h: number } = MAP, roam: number = ROAM): { x: number; y: number; w: number; h: number } {
  const pad = { x: box.w * roam, y: box.h * roam };
  return { x: -box.w / 2 - pad.x, y: -box.h / 2 - pad.y, w: box.w + pad.x * 2, h: box.h + pad.y * 2 };
}


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
export function installMapArt(): void {
  // THE COAT RECIPES, installed as an ordinary consumer would. A coat is a NAME looked up in a
  // registry, and a name nobody registered resolves to nothing and paints nothing — in silence.
  // Here rather than per desk, because the marks are the SHELF'S (`ANCHOR_MARK`, `zoneKeen`) and a
  // desk that forgot the call would go on working with one feature invisibly missing.
  installStockCoats();
  registerAsset(GRID, { src: GRID_TILE, w: 1, h: 1 });
  registerAsset(KNIGHT_SURFACE, { src: KNIGHT_PIECE, w: KNIGHT.w, h: KNIGHT.h });
  registerLayout("gesture.map.free", freeLayout);
  registerSurface(MAP_SURFACE, {
    layers: [{ paint: "sunkBg" }, { image: GRID, fit: "repeat", opacity: 0.35 }],
    radius: 0.2,
    // The map's own edge, so the bound the camera stops at is a thing the eye can see it reach.
    stroke: { color: "panelBorder", width: 0.04 },
  });
  // THE HANDLE IS THE MAP'S OWN FURNITURE, not the chips'. Every desk here can form a heap, so every
  // desk can grow a tab — and a tab whose surface nobody registered is not an error anywhere: an
  // unregistered name is SKIPPED (one bad reference must not take a scene down), so the control is
  // simply drawn into nothing and the page looks as though stacking had been switched off.
  registerAsset(GRIP_RIDGES, { src: GRIP_BARS, w: GRIP.w, h: GRIP.h });
  // A GHOST AND NOT A CARD: no fill at all, a dashed outline in the muted ink. It has to be read as
  // a PLACE — the felt showing through where the stack will stand — and anything filled would read
  // as a card already lying there, which is the one thing it must never be mistaken for.
  registerSurface(MARK_SURFACE, {
    layers: [],
    // BRIGHT ENOUGH TO READ THROUGH A SHADOW. The thing being carried is in the AIR, so it throws a
    // shadow, and the shadow falls exactly where the silhouette is — that is not a coincidence, it
    // is the same place twice: where this will land. A hairline in the muted ink simply vanished
    // under it, which made the one picture the reader needed the one they could not see.
    stroke: { color: "text", width: 0.04, opacity: 0.85, dash: { on: 0.16, off: 0.12, corner: "dash" } },
  });
  registerSurface(GRIP_SURFACE, {
    layers: [{ paint: "panelBg" }, { image: GRIP_RIDGES, fit: "contain" }],
    radius: GRIP.h / 2,
    stroke: { color: "panelBorder", width: 0.02 },
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
export const PUT_DOWN = Draggable({ onReject: "stay" });

/**
 * THE LAMP OVER THE DESK — and without one nothing casts anything at all.
 *
 * A shadow takes two: a piece willing to throw one (`ShadowCaster`) and a light to throw it by
 * (`Lit`). The second is the DESK's, not the piece's — one lamp over a table, not a lamp per card —
 * and it is a `rootOnly` field for exactly that reason. Composing casters and stopping there is what
 * I did, and it is why nothing changed on the glass: every piece was willing and the room was dark.
 *
 * The stock lamp — top-right, so shadows fall down-left and read as height anywhere. The DEPTH is
 * this shelf's own; see below for why the kit's own numbers cannot be used here.
 */
export const LAMP = Lit({
  // ITS OWN DEPTH, because these desks are DARK. The stock shadow is a soft dark at a quarter
  // opacity, a hair of offset at rest — right over a pale table, and invisible over this one: a dark
  // wash on a near-black felt is a dark wash on a near-black felt. The shadows were there all along
  // (the plan draws one per piece), and none of them could be seen, which is the same as not having
  // them. Deeper and further, so the eye can tell a piece lying down from one held up.
  shadow: { base: 0.08, perZ: 0.06, lifted: 0.34, opacity: 0.5 },
});

/**
 * A PIECE ON A DESK THROWS A SHADOW, and that is not decoration.
 *
 * Half of what these pages show is HEIGHT — a piece lifts as it is picked up, hangs at the hand's
 * height while it is carried, falls from that height when it is let go — and height is the one thing
 * a desk seen from above cannot draw. Without a shadow a card in the air and a card on the felt are
 * the same picture, and every page about lifting, dropping and throwing is teaching a difference the
 * reader cannot see. The `Hold` and `Tap` squares have had one since the shelf existed for exactly
 * this reason; the desks that came after simply never got it.
 *
 * From the SILHOUETTE, which is the atom's own default: a shadow is what the drawn thing blocks, and
 * for a chip that is a disc rather than the square it is measured by.
 */
export const CASTS = ShadowCaster();

/** Everything a piece lying on one of these desks is: it stays where it is put, and it casts. */
export function onTheDesk(piece: Node): Node {
  compose(piece, PUT_DOWN);
  compose(piece, CASTS);
  return piece;
}

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
  for (const warm of warmingNodes()) add(desk, warm);
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
const GRIP_SURFACE = "gesture.map.grip";
const MARK_SURFACE = "gesture.map.mark";
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
export const GRIP_GAP = 0.06;
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

/** True for the pieces this desk lets form a heap together — a card with a card, a chip with a chip. */
export function sameKind(a: Node, b: Node): boolean {
  const k = kindOf(a);
  return (k === "card" || k === "chip") && k === kindOf(b);
}

/**
 * WHAT MAY LIE IN ONE HEAP, and how a heap stands once it is lifted — a desk's answer, not the kit's.
 *
 * Every desk on this shelf so far has had the same one (same kind, touching, one step per piece) and
 * so it was written into `heapsOf` directly. A desk with a stricter rule is not a special case of
 * that one: `Mechanics/Stack merging` asks how MUCH two pieces overlap and which way up they are
 * lying, and neither question can be phrased as a tweak to "do the outlines meet". So the questions
 * became a seam, and the shelf's original answer became one implementation of it.
 *
 * Three questions, and they are three because they are asked at three different moments: `joins` per
 * PAIR while the islands are being found, `admits` per ISLAND once one has been, and `seats` when a
 * handle picks one up. A rule that had to answer all three at once could not say "these two touch
 * enough, and yet this one is not in the heap" — which is the whole of rules 3 to 6 down there.
 */
export interface HeapRule {
  /** May these two lie in one heap? Asked for every pair whose boxes are near enough to bother. */
  readonly joins: (a: Node, b: Node) => boolean;
  /**
   * ...AND ARE THEY CLOSE ENOUGH? THE geometry question, asked with the two pieces and the two
   * outlines as they actually stand.
   *
   * Apart from `joins` because it is a different question about a different thing: `joins` is about
   * what the two pieces ARE and has no geometry in it, this is about where they happen to be lying
   * and has nothing else. A throw that leaves a card with one corner over a pile has answered the
   * first question yes and the second no, and that is exactly the accident this exists for.
   *
   * The pieces come with the outlines because "close enough" is not one number: a card has to be
   * COVERED and a chip only has to be NEAR, and which of those a piece means is written on the
   * piece (`Heaping.reach`), not chosen here.
   */
  readonly meets: (a: Node, b: Node, oa: readonly Vec[], ob: readonly Vec[]) => boolean;
  /** Which of an island's pieces the heap actually takes. Given in paint order, bottom first. */
  readonly admits: (group: readonly Node[]) => readonly Node[];
  /** Where each piece stands under the handle that lifted them, in the handle's own frame. */
  readonly seats: (group: readonly Node[], gripW: number) => Vec[];
  /**
   * HOW A RUN LIFTED BY A PLACE'S HANDLE STANDS — its seats AND its turns. Absent, the ordinary
   * squared stack, which is what every handle on the shelf has lifted so far.
   *
   * A place may pose what it holds differently from how a heap poses itself, and differently again
   * from how it poses them while they are lying in it. A hand of cards is the case everybody knows:
   * laid out in a row on the felt, splayed into a fan the moment it comes up, and back into a row
   * the moment it is put down again. Three poses, one set of cards, and the only thing that says
   * which is where they are and whether they are moving.
   *
   * The turn is DATA and not something read back off the glass: a carried pose is the piece's own
   * resting pose with the style composed onto it, so a face-down card's mirror is in there and reads
   * as a half circle. The desk that decided the fan is the one that knows what the angle was.
   */
  readonly fan?: (
    group: readonly Node[],
    gripW: number,
    /**
     * HOW MUCH ROOM THE HAND IS ALLOWED, in root units — what the reader can actually SEE.
     *
     * Not the desk. A desk is as big as the game wants and a screen is as big as it is, and a hand
     * measured against the first runs off the second: the outer cards sit past the glass, where
     * nobody can read them and nobody can reach them. What a spread is bounded by is the room it is
     * being held IN, and that room is the viewport.
     */
    room: number,
  ) => readonly { readonly at: Vec; readonly deg: number }[];
  /**
   * WHAT THE DESK DOES TO WHAT HAS JUST BEEN PUT DOWN, once the tree says where everything is.
   *
   * A drop leaves pieces as they were — that is the whole of a drop, and a fan let go of on the felt
   * stays a fan. A PLACE is the exception: it has an opinion about how its things lie, and what it
   * takes it re-poses. Nothing else on the shelf needs this, so it is absent everywhere else.
   */
  readonly settled?: (root: Node, ids: readonly string[]) => void;
  /**
   * THE PANEL'S NUMBERS, WRITTEN INTO A DESK THAT IS ALREADY STANDING.
   *
   * A desk is furniture and is not rebuilt because a knob moved — a reader who has dealt a hand
   * would lose it to the very control that was meant to show them something. So anything a control
   * puts INTO the tree (a zone's reach) or into a registry the tree names (an arrangement) is
   * written again here, on every render, to the desk the reader is already working in.
   */
  readonly tune?: (root: Node) => void;
  /**
   * HEAPS THAT TOUCHING CANNOT FIND — a place that HOLDS things, rather than things that hold each
   * other.
   *
   * A heap on the felt is an accident of where pieces came to rest: nobody declared it, it is simply
   * what is touching what, and it appears and vanishes as pieces move. A ZONE is the opposite claim
   * — it is a place, it was there before anything was put in it, and its handle belongs to it and
   * not to whatever happens to be lying in it today. Islands cannot express that, and a zone squeezed
   * into one would be a piece: liftable, carryable, and gone the moment somebody dragged it.
   *
   * `under` is the node the handle stands beneath — the zone itself, so the tab is always in the same
   * place — and `pieces` is what the handle lifts, which is never the zone.
   */
  readonly held?: (root: Node, aloft: (id: string) => boolean) => readonly { readonly under: Node; readonly pieces: readonly Node[] }[];
}

/** The shelf's original answer: a card with a card, a chip with a chip, touching, one step apart. */
export const TOUCHING: HeapRule = {
  joins: sameKind,
  meets: (_a, _b, oa, ob) => outlinesTouch(oa, ob, TOUCH_SLACK),
  admits: (group) => group,
  seats: stackSeats,
};

/**
 * THE HEAPS ON THE DESK RIGHT NOW — every set of pieces of one kind joined by a chain of touches.
 *
 * The kit answers "do these two outlines overlap"; WHICH pieces are allowed to is this desk's rule
 * and lives here. Groups of one are dropped: a lone card is not a heap, and a handle under it would
 * be a control that does nothing.
 */
export function heapsOf(root: Node, aloft: (id: string) => boolean = () => false, rule: HeapRule = TOUCHING): Node[][] {
  const poses = transformsOf(root);
  // A HEAP IS WHAT IS LYING ON THE DESK. A piece the clock is taking somewhere is not lying
  // anywhere: it left the heap at the moment it was taken out of it, and a handle that still
  // counted it would pull a card back out of the air it was thrown into.
  const pieces = root.children.filter((n) => rule.joins(n, n) && !aloft(n.id));
  const outline = new Map<string, ReturnType<typeof placedOutline>>();
  for (const n of pieces) {
    const shape = fieldsOf<BoundedFields>(n, "Bounded")?.bounds;
    const at = poses.get(n.id);
    if (shape && at) outline.set(n.id, placedOutline(outlineOf(shape), at));
  }
  const touch = (a: Node, b: Node): boolean => {
    const oa = outline.get(a.id);
    const ob = outline.get(b.id);
    return !!oa && !!ob && rule.joins(a, b) && rule.meets(a, b, oa, ob);
  };
  // ADMITTED AFTER THE ISLAND IS FOUND, never during. Which pieces a heap takes can depend on the
  // whole island — on which of them is on top of it — and a union-find asks about pairs and knows
  // nothing about tops. Cut afterwards, and what is left of one is a heap only if two are left.
  return islands(pieces.filter((n) => outline.has(n.id)), touch)
    .map((group) => [...rule.admits(group)])
    .filter((group) => group.length > 1);
}

/** A handle says so on itself. Its id is a NAME and nothing reads it — membership is looked up. */
export const isGrip = (n: Node): boolean => kindOf(n) === "grip";

/** The picture of where a carried run will come down. Like a handle, it is drawn and never played. */
export const isMark = (n: Node): boolean => kindOf(n) === "mark";

/**
 * A CONTROL OR A PICTURE — anything on the desk that is not a piece of the game.
 *
 * Handles and landing marks are both drawn by the desk, both ride a carry, and neither is ever
 * seated, heaped, handed to a zone or counted in a run. They are asked about together everywhere,
 * so they are asked with one word: a second list of exceptions somewhere is a place for the two to
 * drift, and the drift shows up as a tab laid out in a hand of cards.
 */
export const isDrawn = (n: Node): boolean => isGrip(n) || isMark(n);

/**
 * THE PICTURE OF WHERE THIS RUN WILL COME DOWN — a card-shaped outline, standing on the felt under
 * the hand that is holding the run.
 *
 * Because a hand carrying a stack is holding it in the AIR, and the air is not where it lands. The
 * cards ride at the hand's height, splayed, a card's width above the tab; the tab travels flat on
 * the felt at the point the run is anchored on. Neither of those is the answer to "where will this
 * stack STAND", and a player carrying thirty-six cards across a desk was being asked to work it out.
 *
 * IT RIDES THE CARRY AND IS NEVER WRITTEN. Given to the hand as one more thing being carried — with
 * no lift, so it stays on the felt, and at the seat the run's first card will take — it follows the
 * finger for free, every frame, without a single write to the tree while the hand is moving.
 */
export function landingMark(at: Vec, box: { readonly w: number; readonly h: number }, nth: number, seat?: string): Node {
  return node(
    `landing mark ${nth}`,
    Bounded({ bounds: roundedRect(box.w, box.h, Math.min(box.w, box.h) * 0.08) }),
    // WHOSE PICTURE IT IS. A seat that is known opens the mark to that seat alone; a desk with no
    // seats (a single-screen story) leaves it open, because there is nobody to hide it from.
    ...(seat ? [Private({ access: [seat] })] : []),
    Surfaced({ surface: MARK_SURFACE }),
    // UNDER WHAT IS BEING CARRIED. The picture and the load are drawn together — both ride the hand,
    // so the plan puts them in the same rank and the order inside it is the z. Left at the desk's
    // own, the mark is the newest child and lands on TOP of the very cards it is a picture for, and
    // a hand of thirty-six is read through a cage. Below them it is a shape on the felt, which is
    // what it is: the load leans over it and the outline still reads all the way round.
    Transformable({ at, z: MARK_UNDER }),
    Valued({ values: { mark: nth } }),
  );
}

/** How far below everything else the landing picture is drawn. Deep enough that nothing sorts under it. */
const MARK_UNDER = -1000;

/**
 * THE SILHOUETTE THIS RUN WILL LEAVE ON THE FELT, and where its middle stands relative to the anchor.
 *
 * The shape of what will BE there, not of what is being held. A hand is carried splayed and in the
 * air; what lands is a squared pile lying flat, and its outline is the run's seats swept by one
 * piece's own box (`stackSeats` — the very seats the landing will write). One card gives one card;
 * thirty-six give a card and the pile's own step, which is a card and a sliver.
 *
 * WITH ITS LANDING POSE, which is upright: a pile has no lean, so neither has the picture of one.
 * A silhouette wearing the fan's angle would be a picture of the hand rather than of the landing.
 */
/**
 * WHERE THE PICTURE OF THE LANDING STANDS — under the anchor, or IN the zone that would take it.
 *
 * The picture is of the PLACE, and when a zone would take this run the place is the zone: a zone
 * lays its own things out in its own arrangement, so where these cards will lie there is the zone's
 * business and not the felt's. Aim at somebody's area and the picture moves into it — the answer
 * before the hand has let go, and given by the very question that lights the zone, so the light and
 * the picture can never say two different things.
 *
 * IT KEEPS ITS OWN SIZE either way. Grown to the zone's outline it would trace the border the zone
 * already draws — a second line on the first, saying nothing the first did not. What has news in it
 * is the same thing as always: the shape of what will be lying there.
 */
export function landingAt(anchor: Vec, seat: Vec, zone: Node | undefined): Vec {
  const home = zone ? fieldsOf<TransformableFields>(zone, "Transformable")?.at : undefined;
  return home ?? { x: anchor.x + seat.x, y: anchor.y + seat.y };
}

export function landingBox(
  run: readonly Node[],
  seats: readonly Vec[],
): { readonly at: Vec; readonly w: number; readonly h: number } {
  const shape = run[0] ? fieldsOf<BoundedFields>(run[0], "Bounded")?.bounds : undefined;
  const own = shape ? extentOf(shape) : { w: 1, h: 1.4 };
  const xs = seats.map((seat) => seat.x);
  const ys = seats.map((seat) => seat.y);
  const x0 = Math.min(...xs) - own.w / 2;
  const x1 = Math.max(...xs) + own.w / 2;
  const y0 = Math.min(...ys) - own.h / 2;
  const y1 = Math.max(...ys) + own.h / 2;
  return { at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, w: x1 - x0, h: y1 - y0 };
}

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
  /**
   * HOW FAR A FINGER MAY MISS THE TAB and still take it, in units — see `Forgiving`.
   *
   * A tab is a few pixels tall on purpose: one drawn as a slab would be a slab, and the heap it
   * stands under is the thing the reader is meant to be looking at. But a fingertip covers forty-odd
   * pixels of glass and hides the target on the way down, so a control that is honest to the EYE is
   * a control that has to be aimed at twice. The answer is not to draw it bigger.
   *
   * IT NEVER STEALS: what is drawn is offered first, and only touches that would have found nothing
   * at all reach this (`pick`). A finger on a card gets the card.
   */
  readonly miss: number;
}

/**
 * HALF A TAB'S WIDTH, forgiven all round.
 *
 * Which is about a fingertip: the tab is drawn to a constant size on the glass (`Screened`), so this
 * is a constant number of pixels too — the same forgiveness at every zoom, because the thing being
 * forgiven is a finger and a finger does not zoom.
 */
export const GRIP_MISS = GRIP.w / 2;

/**
 * HOW FAR WHAT IS BEING CARRIED HANGS OFF THE FINGER, as a factor of its own height.
 *
 * THE FINGER IS THE HOLDER, and what hangs on it is the handle and the picture of where the load is
 * going. The load itself hangs ABOVE, clear of both. Drawn ON the finger it covers the one thing the
 * gesture is FOR: a player carrying a card across a desk could not see where the card was going,
 * because the card was in the way of the answer — and the answer is the whole reason there is a
 * picture at all. A held thing may lag the finger by a mile and it may sit some way off it; what it
 * may not do is stand on top of the place it is being sent to.
 *
 * A FACTOR of the load's height and not a fixed gap, so a card clears a card and a pile clears a
 * pile: what has to be cleared is the picture of the landing, and the landing is the load's own size.
 *
 * A THIRD, not the whole. Edge to edge is ONE — the load and the picture just touching — and that
 * is the number this began at. It is far too much: on a phone the load ends up a card's height off
 * the finger, which reads as a thing that got away from you rather than a thing in your hand, and
 * the further the load is from the place it is going, the less the picture of that place is worth.
 *
 * What had to be fixed was a load standing ON the answer and hiding it. It does not hide it any
 * more: the picture is drawn UNDER what is being carried, so the whole outline reads however far the
 * load leans over it, and this number is now only about how a held thing should sit in a hand.
 */
export const CARRY_CLEAR = 0.32;

const GRIP_SPEC: GripSpec = { w: GRIP.w, miss: GRIP_MISS, ...GRIP_HOLD };

/** The handle for one heap: a wide low tab under the middle of everything the heap covers. */
/**
 * A HANDLE'S OWN WORD FOR WHOSE IT IS — a heap's, or a place's.
 *
 * The two are lifted differently (`HeapRule.fan`), and the difference has to be readable off the tab
 * a finger landed on. Said on the node, as a field, because everything on this desk is: the
 * alternative is the scene keeping a list of which tabs it made how, and a list is a thing that goes
 * stale between the moment it is written and the moment somebody drops a card.
 */
export const isPlaceGrip = (n: Node): boolean => fieldsOf<ValuedFields>(n, "Valued")?.values?.["place"] !== undefined;

function gripFor(root: Node, under: readonly Node[], nth: number, spec: GripSpec, ofPlace = false): Node {
  const { mid, bottom } = heapBox(root, under);
  const h = spec.w / GRIP_RATIO;
  return node(
    `stack handle ${handlesDrawn++}`,
    Bounded({ bounds: roundedRect(spec.w, h, h / 2) }),
    Surfaced({ surface: GRIP_SURFACE }),
    Transformable({ at: { x: mid, y: bottom + GRIP_GAP + h / 2 } }),
    Valued({ values: ofPlace ? { grip: nth, place: 1 } : { grip: nth } }),
    // A HANDLE IS SIZED FOR THE FINGER, not for the desk: the same pixels at every zoom, the way
    // every drag handle in every application anybody has ever used is drawn.
    Screened({ min: spec.min, max: spec.max }),
    // ...AND IT IS EASIER TO CATCH THAN TO SEE. The picture stays exactly the size it was.
    Forgiving({ miss: spec.miss }),
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
export function regrip(
  root: Node,
  spec: GripSpec = GRIP_SPEC,
  aloft: (id: string) => boolean = () => false,
  keep?: string,
  rule: HeapRule = TOUCHING,
): Map<string, readonly Node[]> {
  const held = new Map<string, readonly Node[]>();
  // A HANDLE A HAND IS HOLDING IS NOT REDRAWN. Every other tab is thrown away and made afresh — that
  // is what keeps them from sliding into each other's places — but the one under a finger belongs to
  // the gesture until the gesture ends. Replaced mid-carry it is a new node the hand never took, and
  // what the hand is holding vanishes out from under it.
  // WHEREVER THEY ENDED UP, not only at the top. A handle is drawn as a child of the desk, but a
  // desk with zones on it can re-home a node — and a tab that found its way inside one would be laid
  // out by that zone as though it were a card, and never swept away again by a pass that only looked
  // at the desk's own children. One stale tab is one control that lifts a heap that is not there.
  for (const owner of [root, ...root.children]) {
    for (const old of owner.children.filter(isDrawn)) if (old.id !== keep) remove(owner, old);
  }
  // A PLACE'S OWN HANDLE FIRST, and what it holds is not on the felt any more as far as the islands
  // are concerned: a card the zone has claimed must not also grow a felt handle of its own, or the
  // reader is given two tabs for one card and whichever they take lifts a different thing.
  const claimed = new Set<string>();
  (rule.held?.(root, aloft) ?? []).forEach(({ under, pieces }, i) => {
    for (const piece of pieces) claimed.add(piece.id);
    if (pieces.length === 0) return; // a place holding nothing has nothing to lift, and no handle
    const tab = gripFor(root, [under], -1 - i, spec, true);
    add(root, tab);
    held.set(tab.id, pieces);
  });
  heapsOf(root, (id) => aloft(id) || claimed.has(id), rule).forEach((group, i) => {
    const tab = gripFor(root, group, i, spec);
    add(root, tab);
    held.set(tab.id, group);
  });
  return held;
}

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
export function regrasp(
  root: Node,
  aloft: (id: string) => boolean = () => false,
  rule: HeapRule = TOUCHING,
): Map<string, readonly Node[]> {
  const held = new Map<string, readonly Node[]>();
  const tabs = root.children.filter(isGrip);
  const claimed = new Set<string>();
  const runs: (readonly Node[])[] = [];
  for (const { pieces } of rule.held?.(root, aloft) ?? []) {
    for (const piece of pieces) claimed.add(piece.id);
    if (pieces.length > 0) runs.push(pieces);
  }
  runs.push(...heapsOf(root, (id) => aloft(id) || claimed.has(id), rule));
  runs.forEach((run, i) => {
    const tab = tabs[i];
    if (tab) held.set(tab.id, run);
  });
  return held;
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
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}





/**
 * WARM EVERY PICTURE THE DESK MIGHT SHOW, by ASKING FOR IT — one tiny node per picture, parked off
 * the map where no camera can reach.
 *
 * The painter loads a texture the first time a PLAN asks to draw it, and until it lands the layer
 * draws nothing at all (`textureFor`: a picture that has not arrived is skipped, so one slow emblem
 * cannot blank a table). That is right, and it is also why a die stutters through its first roll:
 * it changes picture ten times a second, and every face it has not shown yet is a frame of nothing.
 *
 * Decoding the image by hand does not help — the painter has its own cache, keyed by source, and it
 * fills only from its own loads. What DOES fill it is a plan that mentions the picture, so that is
 * what this is: the first frame asks for all of them at once, and every one is there by the time
 * anybody wants it.
 *
 * Asked of the SURFACE registry rather than of the dice, so nothing here has to know what a face
 * is: whatever has been registered with a picture in it by the time the desk is built gets warmed.
 */
export function warmingNodes(): Node[] {
  const out: Node[] = [];
  for (const name of surfaceNames()) {
    const layers = surfaceRecord(name)?.layers ?? [];
    if (!layers.some((l) => l.image)) continue;
    out.push(
      node(
        `warm ${name}`,
        Bounded({ bounds: rect(WARM, WARM) }),
        Surfaced({ surface: name }),
        // Off the map and off the camera's own content, so nothing can be looked at or touched.
        Transformable({ at: { x: MAP.w, y: MAP.h + out.length * WARM * 2 } }),
        Valued({ values: { warm: 1 } }),
      ),
    );
  }
  return out;
}

/** How big a warming node is, in units — as small as a thing can be and still be asked for. */
const WARM = 0.02;


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
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}

/** Turn a card over: the truth, and the picture follows it (`Flippable` owns the reflection). */
export function turnOver(card: Node): void {
  setFacing(card, facing(card) === "up" ? "down" : "up");
}
