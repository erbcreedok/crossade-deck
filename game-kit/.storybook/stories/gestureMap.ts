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
  Forgiving,
  installStockCoats,
  add,
  apply,
  surfaceNames,
  surfaceRecord,
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
  Lit,
  Screened,
  ShadowCaster,
  transformsOf,
  freeLayout,
  node,
  rect,
  registerAsset,
  reorder,
  registerLayout,
  registerSurface,
  facing,
  setFacing,
  Surfaced,
  Transformable,
  Valued,
  type BoundedFields,
  type Node,
  type ValuedFields,
  polar,
  type TransformableFields,
  type Vec,
  type Walls,
  type Coat,
  type Paint,
  type Stroke,
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
export function deskRoom(roam: number = ROAM): { x: number; y: number; w: number; h: number } {
  const pad = { x: MAP.w * roam, y: MAP.h * roam };
  return { x: -MAP.w / 2 - pad.x, y: -MAP.h / 2 - pad.y, w: MAP.w + pad.x * 2, h: MAP.h + pad.y * 2 };
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
export function mapWalls(piece: Node, lift = 1): Walls {
  const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
  const size = shape ? extentOf(shape) : { w: 0, h: 0 };
  const x = MAP.w / 2 - (size.w * lift) / 2;
  const y = MAP.h / 2 - (size.h * lift) / 2;
  // A piece bigger than the map has nowhere to stand: the box collapses to the middle rather than
  // turning inside out, which is what a negative half would do.
  return { x0: Math.min(-x, 0), y0: Math.min(-y, 0), x1: Math.max(x, 0), y1: Math.max(y, 0) };
}

/**
 * THE TWO WAYS A THING CAN LEAVE A HAND on this desk.
 *
 * `settle` is the ordinary putting-down every page on the shelf started with: the piece eases to the
 * seat the finger chose, the pop unwinding on the way, and that is all. Nothing is thrown, so there
 * is nothing to schedule and nothing to re-order first — which is why it is the quiet one.
 *
 * `fall` is the drop proper: a body let go of at the hand's height, coming down under its own weight
 * and bouncing as its own material does. It buys the weight and costs the machinery.
 *
 * A card wants the first and a chip the second, and that is not a contradiction: a card put down on
 * a felt IS a putting-down, while a chip dropped on one is a thing landing. The desk lets each say
 * which it is, and the panel lets a reader disagree.
 */
export type LetGo = "settle" | "fall" | "roll";

/**
 * How fast a dropped die goes over, degrees/s, when the hand gave it no turn of its own.
 *
 * A die let go of ROLLS — that is what a die is for, and a die that came down flat and simply lay
 * there would be a counter. Off the tuning's own `spinFriction` this is about two thirds of a second
 * of turning, which is long enough to read as a roll and short enough not to be a wait.
 */
export const DIE_SPIN = 1400;
/**
 * How fast that turn bleeds away, degrees/s² — steeper than the desk's own, so a faster roll is not
 * also a longer one. A die that kept turning for three seconds is a die nobody is waiting for.
 */
export const DIE_SPIN_DRAG = 900;
/**
 * HOW HARD A ROLLED DIE COMES OFF THE DESK, units/s of rise.
 *
 * A die does not skate. Dropped from the hand's height alone it arrives at about five units a
 * second and gives back a fraction of that — a hop of two pixels, which is a die that landed, not
 * one that rolled. This is the kick a wrist gives it, and it buys the thing the whole gesture is
 * about: it leaves the felt, comes down, turns its run a little, and does it again.
 */
export const DIE_HOP = 3;

/**
 * HOW HARD A HANDFUL OF DICE PUSHES ITSELF APART, units/s — and it is a real throw, not a nudge.
 *
 * Two dice tipped out of a hand do not land side by side because somebody aimed them there; they
 * land apart because they were never going the same way. This is that: enough speed for each to
 * make its own way across the felt, so a drop of two reads as two dice thrown rather than as one
 * die that split.
 */
export const DIE_SCATTER = 2.6;

/**
 * HOW WIDE THE FAN IS, degrees between one die of a run and the next.
 *
 * Wide enough that they part at once and narrow enough that a throw still goes where it was aimed:
 * a handful thrown at the far corner must arrive at the far corner, spread out, not sprayed across
 * the whole desk.
 */
export const DIE_FAN = 34;

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
export const THROWN_AT = 150;

/**
 * THE PART OF THE GESTURE THAT WAS A FLICK, in units of desk — or nothing, for a hand that was only
 * carrying. THE ONE PLACE the display and the desk meet.
 *
 * `swing` is the finger's own speed on the glass, measured where the finger is (`wireDrag`), in
 * pixels per second. Not a speed read back off the carry's springs and multiplied by the zoom to
 * undo the division that put it there: a number run from the display onto the canvas and back out
 * through the camera is three conversions deep, and every one of them is a place to be wrong by a
 * factor nobody can see. The finger's speed on the screen is a thing that is simply KNOWN.
 *
 * WHAT IS TAKEN IS THE EXCESS (`threwAt`) and never the whole of it. Carrying is moving: a card let
 * go of on the way across the desk was not thrown anywhere, and taking the whole speed made every
 * unhurried pass end in a flight. What is left after the threshold is what the hand actually spent
 * on throwing.
 *
 * ...AND IT IS DIVIDED BY THE SCALE EXACTLY ONCE, here, because the flight is a thing that happens
 * on the desk and the desk is measured in units. Everything above this line is the gesture and
 * everything below it is the world.
 */
export function flickOf(swing: Vec | undefined, perUnit: number, drag = 0): Vec | undefined {
  if (!swing || perUnit <= 0) return undefined;
  const speed = Math.hypot(swing.x, swing.y);
  const flick = threwAt(speed);
  if (flick <= 0) return undefined;
  const at = flick / speed / perUnit;
  const world = { x: swing.x * at, y: swing.y * at };
  // ...AND THEN IT IS ASKED WHETHER IT WOULD GO ANYWHERE.
  //
  // A speed alone cannot answer "was that a throw", which is why every number tried for it has been
  // wrong in one direction or the other. What a hand MEANT is legible in where the piece would end
  // up: this is how a phone tells a flick from a careful scroll, and it is the same arithmetic the
  // zone is already asked (`restsAt`, `v²/2a`). Under `THROW_REACH` the piece would land a third of
  // a card from where it was let go of, which is a putting-down that took a run-up — and flying it
  // means a whole animation, a whole stagger and a whole reassembly to move it almost nowhere.
  const far = drag > 0 ? (flick / perUnit) ** 2 / (2 * drag) : Infinity;
  return far >= THROW_REACH ? world : undefined;
}

/**
 * A THROW THAT WOULD NOT CARRY A PIECE THIS FAR IS A PUTTING-DOWN, in units.
 *
 * About a third of a card. Below it nothing that matters is different: the piece ends up where the
 * hand left it either way, and the only thing the flight adds is TIME — a stagger, a landing, and a
 * run reassembling itself, all to travel a distance nobody can see. Above it the hand plainly sent
 * the piece somewhere, and the flight is the picture of that.
 */
export const THROW_REACH = 0.35;

/**
 * WHAT A HAND ACTUALLY THREW, in units/s — the speed it had OVER the throwing speed, not all of it.
 *
 * Carrying is moving. A hand crossing the desk with a card in it is going somewhere at three or
 * four units a second, and taking that as the throw means every ordinary putting-down is a flick:
 * let go while still walking the card over and it sails off, which is what a hand never does and
 * what nobody asked it to do.
 *
 * It also puts a CLIFF at the threshold. Below it nothing flies at all; a hair above it and the
 * piece leaves at full carrying speed — the same gesture, a millimetre apart, giving nothing and
 * giving everything. Measured as the excess, a throw begins at nothing exactly where it begins to
 * be a throw, and grows from there: what travels is the part of the gesture that was a THROW, and
 * the part that was merely carrying is left where carrying leaves things.
 */
export function threwAt(speed: number): number {
  return Math.max(0, speed - THROWN_AT);
}

/**
 * Does this piece FLY when the hand lets go at `speed`? Its own way of leaving, unless the hand was
 * moving fast enough to overrule it.
 */
export function thrown(piece: Node, speed: number, ways: Parameters<typeof dropOf>[1] = {}): boolean {
  return dropOf(piece, ways).fall !== "settle" || speed > 0;
}

/** What a piece does once the hand lets go of it — how it comes down, and how it comes off a wall. */
export interface DropFeel {
  /** Eased to its seat, or dropped from the hand's height under its own weight. */
  readonly fall: LetGo;
  /**
   * How much of the HAND's speed this piece takes when it is thrown, 0..1.
   *
   * Not everything leaves a hand at the speed the hand had. A chip is small and heavy for its size
   * and stops being pushed the moment it is let go; a card has a whole face on the felt and goes
   * where it was sent. One gain for all of them made the lightest thing on the desk the fastest,
   * which is the opposite of what a hand feels.
   */
  readonly throwGain: number;
  /** How fast the desk eats its speed, units/s². Absent, the tuning's own. */
  readonly friction?: number;
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
  /**
   * HOW MUCH ROOM IT TAKES FROM ITS OWN KIND, root units, and `0` for a piece that takes none.
   *
   * Zero is right for nearly everything on a desk: cards land on cards, chips land on chips, and a
   * pile is what a desk is FOR. A die is the exception, because a die is read rather than stacked —
   * two of them one over the other is one die with a shadow and one result nobody can see.
   */
  readonly girth: number;
  /** What it gives back off ANOTHER piece, 0..1. Absent, the desk's own `bounce`. */
  readonly bodyBounce?: number;
  /** The world it is solid in — see `SlideOptions.solid`. Pieces of different worlds never meet. */
  readonly solid: string;
  /**
   * HOW FAR APART A HANDFUL OF THEM GOES, units/s, and in a fan.
   *
   * Two dice let go of by the same hand at the same instant take the same speed in the same
   * direction, and physics has nothing to say about that: they travel as one and arrive as one.
   * What a hand actually does is open, and a handful thrown from an opening hand spreads. So each
   * piece of a run gets its own heading, fanned about the throw, and its own small push along it —
   * the push is what makes a DROP scatter too, where there is no throw to fan.
   */
  readonly scatter: number;
}

/**
 * A PANEL'S SAY OVER WHAT TAKES UP ROOM — how much, how hard it knocks, how far a handful spreads.
 *
 * The desk's own answers are on the pieces (`dropOf`) and are the ones a reader should meet first.
 * This is for the page that is ABOUT the collision: a girth of nothing switches it off entirely and
 * leaves the desk as it was before the feature, which is the same promise every other switch on the
 * shelf makes. It reaches only the pieces that collide at all — a card is not given a girth by a
 * reader turning a knob, because a card landing on a card is what a desk is for.
 */
export interface Bump {
  /**
   * HOW MUCH ROOM THIS PIECE TAKES AND WHICH WORLD IT TAKES IT IN — `undefined` for one that takes
   * none at all, which is what every piece on every other desk says.
   *
   * Asked per PIECE, and it has to be: a desk holds a card, a chip and a die, three sizes, and one
   * number could only ever be right for one of them — the same reason the border is asked per piece
   * (`mapWalls`). And the world is the other half of the answer, because "solid" is not one
   * question: dice and chips knock each other about, cards LIE on what is under them, and a card
   * that bounced off a die could never be dealt onto one.
   */
  readonly roomFor: (piece: Node) => { readonly girth: number; readonly solid: string } | undefined;
  /** What a piece gives back off ANOTHER piece, 0..1. */
  readonly bounce: number;
  /** How hard a handful pushes itself apart, units/s. */
  readonly scatter: number;
  /**
   * DOES WHAT IS ALREADY LYING THERE HOLD ITS PLACE when something is merely PUT DOWN beside it?
   *
   * A page's own switch, and off by default, because it is a second answer and not a correction to
   * the first. Off, everything that gets in the way is an ordinary body: shoved by whatever reaches
   * it, however gently it was let go. On, a release below the throwing speed leaves the furniture
   * exactly where it stood — still solid, so nothing lands on top of it, simply not pushed.
   *
   * Two pages, two answers, and neither is the other's bug: `Mechanics/Collision` is the desk where
   * everything moving knocks everything about, and `Mechanics/Landing` is the desk where a thing put
   * down beside another thing does not shove it aside.
   */
  readonly holds: boolean;
}

/**
 * The desk's own numbers, replaced by the panel's wherever the panel has an opinion.
 *
 * REPLACED, not patched: a page about collision may hand room to a piece the desk gives none to, and
 * take it away from one the desk does. Absent, nothing here happens at all and every desk on the
 * shelf keeps exactly the feel it had.
 */
export function bumped(feel: DropFeel, piece: Node, bump?: Bump): DropFeel {
  if (!bump) return feel;
  const room = bump.roomFor(piece);
  if (!room) return { ...feel, girth: 0, scatter: 0 };
  return { ...feel, girth: room.girth, solid: room.solid, bodyBounce: bump.bounce, scatter: bump.scatter };
}

/**
 * DOES THIS RELEASE SHOVE WHAT IS ALREADY LYING THERE?
 *
 * Only a throw does, and only on a desk that asked for the distinction (`Bump.holds`). A piece put
 * down beside another piece has no business flicking it across the felt, and a piece dropped from
 * above has none either — it finds room and settles. What tells the two apart is the only thing that
 * differs: whether the hand was going anywhere. A desk that did not ask is unchanged: everything
 * that reaches anything shoves it, which is what a desk without the rule has always done.
 *
 * The SAME threshold that decides whether a released piece flies at all (`thrown`), so "thrown"
 * means one thing on this shelf and not two. A second number here would be a second definition of
 * the word, and the day they drifted apart there would be a release that flies without shoving and
 * nobody able to say why.
 */
export function shoves(speed: number, holds = true): boolean {
  return !holds || speed > 0;
}

/**
 * WHERE A THROW WILL COME TO REST, before it has travelled a single frame.
 *
 * A slide bleeds a fixed amount of speed per second — constant deceleration — so the distance it
 * will cover is arithmetic and not a guess: `v² / 2a`, the same sum a first physics lesson does. It
 * is exact for the flight the desk actually files, which is what makes it worth asking at all.
 *
 * Worth asking because a magnet that only catches a piece PUT DOWN near a zone is half a magnet. A
 * card flicked at somebody's area is aimed just as plainly as one carried there, and a desk that
 * answered "you let go too far away" to a throw that was going to land in the zone anyway would be
 * refusing the more confident of the two gestures.
 *
 * Walls are not in it: a throw that would bounce ends up somewhere this does not predict. That is
 * the honest limit, and it is the right side to be wrong on — a throw hard enough to reach a wall is
 * not a throw anybody meant to drop into a zone a few units away.
 */
export function restsAt(from: Vec, hand: Vec | undefined, feel: DropFeel, friction: number): Vec {
  if (!hand) return from;
  const speed = Math.hypot(hand.x, hand.y) * feel.throwGain;
  const drag = feel.friction ?? friction;
  if (speed <= 0 || drag <= 0) return from;
  const far = (speed * speed) / (2 * drag);
  return { x: from.x + (hand.x / Math.hypot(hand.x, hand.y)) * far, y: from.y + (hand.y / Math.hypot(hand.x, hand.y)) * far };
}

/**
 * EVERY PIECE OF A THROWN RUN, AIMED AT ITS OWN PLACE IN THE FORMATION — its speed and its heading,
 * in the run's order, so it comes to rest exactly at its seat around where the ANCHOR stops.
 *
 * A thrown run is otherwise a handful of separate throws that happen to share a hand: each piece
 * leaves from where the fan put it and travels its own distance, so the hand arrives on the felt as
 * the same spread it was held in — a stack in name only. Tidying that up after the landing is what
 * a correction looks like; aiming each piece at its seat makes them converge on the way down.
 *
 * SOLVED, NOT GUESSED. A slide of speed `v` under drag `a` stops after `v²/2a`, so the speed that
 * stops at distance `d` is `sqrt(2ad)` — the exact inverse of `restsAt`, which is what the zone is
 * asked about, so where the run is AIMED and where it LANDS are one number and not two.
 */
export function flockTo(
  run: readonly Node[],
  anchorAt: Vec,
  hand: Vec,
  feel: DropFeel,
  drag: number,
  seats: readonly Vec[] = stackSeats(run),
): { readonly speed: number; readonly angle: number; readonly friction: number }[] {
  const home = restsAt(anchorAt, hand, feel, drag);
  // THE DRAG THE THROW WILL ACTUALLY FEEL. A piece may state its own (`DropFeel.friction`) and the
  // desk's is only the fallback — solved against the desk's while flying under its own, every seat
  // would be missed by the ratio between them, which is a formation that lands somewhere else.
  const pull = feel.friction ?? drag;
  // HOW LONG THE THROW LASTS — the ANCHOR'S own flight, and every piece is given that same time.
  //
  // Not each its own. A run leaves the hand as a fan, so the far card has three times the outer
  // one's distance to cover; solved separately, each gets the speed its own gap deserves and lands
  // when its own arithmetic says — which is a hand arriving as a QUEUE over the better part of two
  // seconds, tearing itself apart on the way down. Worse, the length of the animation was then set
  // by how wide the fan was rather than by how hard the throw was, so a gentle flick of thirty-six
  // cards took longer than a hard one of three.
  //
  // One time for the hand, and it is the time the THROW deserves: a slide of speed `v` under drag
  // `a` runs for `v/a`. Each piece is then given the speed and the drag that cover ITS distance in
  // exactly that time — `v = 2d/T` and `a = v/T`, the same constant-deceleration slide the desk
  // files for everything else. They set off together, they arrive together, and the whole thing
  // lasts as long as the hand meant it to.
  const flight = Math.hypot(hand.x, hand.y) * feel.throwGain;
  const span = pull > 0 ? flight / pull : 0;
  return run.map((piece, i) => {
    const seat = seats[i] ?? { x: 0, y: 0 };
    const from = fieldsOf<TransformableFields>(piece, "Transformable")?.at ?? { x: 0, y: 0 };
    const to = { x: home.x + seat.x, y: home.y + seat.y };
    const gap = Math.hypot(to.x - from.x, to.y - from.y);
    const speed = span > 0 ? (2 * gap) / span : 0;
    return { speed, friction: span > 0 ? speed / span : pull, angle: polar({ x: to.x - from.x, y: to.y - from.y }).angle };
  });
}

/**
 * WHAT ELSE ON THE DESK IS IN THE WAY OF THIS THROW.
 *
 * Collision is between BODIES, and a piece that is not moving is not one: it landed, its seat was
 * written, the physics forgot it. So a die thrown across a desk sails over every chip already on the
 * felt and comes to rest on one — the same complaint the mechanic exists to answer, wearing "but it
 * was not moving" as an excuse. For the length of the throw these become bodies too.
 *
 * Only the ones that could actually be hit: something already in the run has its own body, and
 * something solid in a world nobody is throwing INTO cannot be reached by anything in this throw.
 * A piece that takes no room at all is never in anybody's way, which is every piece on every desk
 * but this one.
 */
export function alsoInTheWay(
  root: Node,
  moving: ReadonlySet<string>,
  worlds: ReadonlySet<string>,
  feel: (piece: Node) => DropFeel,
): Node[] {
  if (worlds.size === 0) return [];
  return root.children.filter((n) => {
    if (moving.has(n.id)) return false;
    const own = feel(n);
    return own.girth > 0 && worlds.has(own.solid);
  });
}

/**
 * HOW MUCH ROOM A PIECE TAKES BY ITS OWN SIZE — half its narrowest side, times whatever the panel says.
 *
 * A factor rather than a length, because the pieces are three sizes: at `1` each takes exactly as
 * much room as it is wide, so two of a kind come to rest edge to edge, and that reads right for all
 * three without anybody choosing a number per piece.
 *
 * The NARROWEST side, and the cost is worth naming: the room is a disc (`separate` says why), so a
 * card measured across its width will let two cards overlap when they are stacked end to end. For a
 * card the alternative is worse — measured by its height, two cards side by side would refuse to
 * come within a card's length of each other, which is not a desk anybody has played on.
 */
export function roomBy(piece: Node, factor: number): number {
  const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
  const size = shape ? extentOf(shape) : { w: 0, h: 0 };
  return (Math.min(size.w, size.h) / 2) * factor;
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
export function dropOf(
  piece: Node,
  ways: { readonly card?: LetGo; readonly chip?: LetGo; readonly die?: LetGo } = {},
): DropFeel {
  // A DIE IS THROWN DOWN, and the desk throws it back: hard, fast, and it hops before it settles.
  // Thrown, it is also the liveliest thing off a border: hard, light for its size, and the only
  // piece here anybody expects to come back across the desk at them.
  if (caps(piece).has("Rollable")) {
    // Half the die's own side: a disc through the flat of its faces, which is where two dice on a
    // felt actually stop each other. See `SlideOptions.girth` on why round is the right shape here.
    const side = extentOf(fieldsOf<BoundedFields>(piece, "Bounded")?.bounds ?? rect(0, 0)).w;
    return { fall: ways.die ?? "roll", throwGain: 1, gravity: 22, bounce: 0.7, wallBounce: 0.7, girth: side / 2, solid: "", scatter: DIE_SCATTER };
  }
  // A CARD TAKES ITS TIME — it is the lightest thing on the desk and the only one with enough face
  // to catch air. Slower than the other two and not SLOW: at a quarter of the die's pull it hung in
  // the air for over a second, which reads as a page loading rather than as a card falling. Two
  // thirds of it is a fall you can see is gentler without waiting for it. Paper does not bounce.
  // Off a wall it does come back, though — it is dead on the cloth, not dead altogether.
  // ...and THROWN it planes: a whole face on the felt, so it goes where it was sent and slides a
  // long way doing it. Nothing about `settle` says a card cannot be thrown — see `thrown`.
  if (caps(piece).has("Flippable")) {
    return { fall: ways.card ?? "settle", throwGain: 0.9, friction: 4.5, gravity: 11, bounce: 0, wallBounce: 0.45, girth: 0, solid: "", scatter: 0 };
  }
  // A CARVED PIECE DOES NOT BOUNCE. It lands like the lump of wood it is — as fast as the die, and
  // then it is simply there.
  //
  // A thousandth and not a quarter, and the number is the owner's own word: a tenth of a percent is
  // "not at all" written down, and it is written down rather than left at zero so that the ORDER of
  // the three still says something — a die is lively, a card is fair, and a carved piece is the end
  // of the scale rather than a piece the scale forgot. Nobody will see it, which is the point.
  // A chip is small and heavy for its size: it stops being pushed the moment it is let go, so it
  // takes barely half of what the hand had and the felt eats that quickly.
  if (kindOf(piece) === "chip") {
    return { fall: ways.chip ?? "fall", throwGain: 0.45, friction: 9, gravity: 20, bounce: 0.35, wallBounce: 0.5, girth: 0, solid: "", scatter: 0 };
  }
  return { fall: "fall", throwGain: 0.7, gravity: 26, bounce: 0.001, wallBounce: 0.001, girth: 0, solid: "", scatter: 0 };
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
 * How far apart the pieces of a lifted stack stand, in units — the same trick `stackLayout` uses:
 * thickness is an `at` offset and never a `z`, or a heap would rise off the felt as it grew.
 */
export const STACK_STEP = { x: 0.012, y: -0.03 };
/**
 * HOW THICK A LIFTED HEAP MAY GET, in units, however many pieces are in it.
 *
 * A step per piece is right for a few and absurd for thirty: at three cards it is the thickness you
 * can see, at thirty it is nearly a whole card of spread and the deck comes up a fan. A real deck
 * does not grow like that either — a card's thickness is not a card's WIDTH, and what the eye reads
 * off a pile is its edge, not its count. So the step shrinks to fit: a small heap is unchanged and a
 * big one is a deck.
 */
export const STACK_THICK = 0.22;
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
export function landingMark(at: Vec, box: { readonly w: number; readonly h: number }, nth: number): Node {
  return node(
    `landing mark ${nth}`,
    Bounded({ bounds: roundedRect(box.w, box.h, Math.min(box.w, box.h) * 0.08) }),
    Surfaced({ surface: MARK_SURFACE }),
    Transformable({ at }),
    Valued({ values: { mark: nth } }),
  );
}

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
 * AND BARELY OVER ONE, because this is a clearance and not a distance. One is edge to edge; the
 * fraction over it is the hairline between them. Held any higher the load stops reading as the thing
 * in your hand and starts reading as a thing that got away from you — and the further it is from the
 * place it is going, the less the picture of that place is worth.
 */
export const CARRY_CLEAR = 1.06;

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

/**
 * Where each piece of a lifted heap stands, relative to the handle that lifted it.
 *
 * BY ITS BOTTOM CENTRE, not its middle. A handle is under a heap, and what is under a thing meets
 * it at its bottom edge — hung by their middles the pieces sit ON the tab with half of each below
 * it, which is a stack skewered on its own handle rather than one standing on it. The gap it stands
 * at is the gap it was DRAWN at (`GRIP_GAP`), so nothing moves relative to anything at the lift.
 */
export function stackSeats(group: readonly Node[], gripW = GRIP.w, want: Vec = STACK_STEP, thick = STACK_THICK): Vec[] {
  const clear = gripW / GRIP_RATIO / 2 + GRIP_GAP;
  // The step a heap this big can afford — see `STACK_THICK`. One piece has no step to take.
  const spread = Math.max(1, group.length - 1);
  const fit = Math.min(1, thick / (Math.abs(want.y) * spread));
  const step = { x: want.x * fit, y: want.y * fit };
  // `|| 0` folds the −0 that `0 * −step` yields at index 0 back to +0, exactly as `stackLayout`
  // does: a negative zero is a real coordinate footgun — it fails `Object.is` and leaks downstream.
  // CENTRED ON THE HANDLE, because that is where the handle stands: `gripFor` puts the tab under the
  // MIDDLE of what it lifts. Counted from the first card instead, the pile it puts down drifts off
  // sideways by half its own spread — and with thirty-six cards that is the better part of a card,
  // so the tab and the pile it stands for ended up in visibly different places. Which is also what
  // the picture of the landing was showing, correctly and uselessly.
  const mid = (group.length - 1) / 2;
  return group.map((piece, i) => {
    const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
    const half = shape ? extentOf(shape).h / 2 : 0;
    return { x: (i - mid) * step.x || 0, y: -clear - half + (i - mid) * step.y || 0 };
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
 * How long apart the pieces of a dropped heap leave the hand, ms.
 *
 * Small on purpose: the whole stack still lands inside one fall, and what the eye reads is a POUR
 * rather than a queue. Wider and it stops being one thing coming down and becomes several things
 * dropped one after another, which is a different gesture.
 */
export const STACK_FALL_STEP = 55;

/**
 * HOW LONG A POUR MAY LAST ALL TOLD, ms, however many pieces are in it.
 *
 * The same shape as the pile's thickness, and the same reason: a step per piece is right for a few
 * and absurd for many. Five cards take four steps and read as a pour; thirty-six would take
 * thirty-five and read as a queue you are waiting on. So the step shrinks to fit — a small heap is
 * unchanged, a big one takes a little longer than a small one and not thirty times longer.
 */
export const STACK_POUR = 620;

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
export function fallOrder(
  pieces: readonly Node[],
  together: ReadonlyMap<string, unknown> = new Map(),
): { readonly piece: Node; readonly delayMs: number }[] {
  const falling = pieces.filter((n) => !isDrawn(n));
  const gaps = Math.max(1, falling.length - 1);
  const step = Math.min(STACK_FALL_STEP, STACK_POUR / gaps);
  // A HAND FLYING IN FORMATION IS NOT A POUR. The stagger is what makes a heap tip out of a hand
  // rather than arrive as a slab — right for pieces that simply fall where they were let go of, and
  // wrong for a run that is being THROWN somewhere, which sets off together and arrives together
  // (`flockTo`). Staggered on top of that, the formation lands as a queue: exactly the tearing the
  // one arrival time exists to end, put back by the thing that was meant to make it read well.
  return falling.map((piece, i) => ({ piece, delayMs: together.has(piece.id) ? 0 : Math.round(i * step) }));
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
