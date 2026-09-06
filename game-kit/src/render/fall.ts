// THE FALL RUNTIME — throw, drop, and settle mechanics for the kit's scenes.
//
// When a gesture ends, what a hand was holding is let go of: slow hands settle, fast hands throw,
// and heavy things fall. Everything here is pure kit data and ballistic calculations.

import { add, byId, caps, compose, fieldsOf, node, remove, reorder, type Node, type NodeId } from "../core/node.js";
import { extentOf, type BoundedFields } from "../core/atoms/bounded.js";
import { Transformable, type TransformableFields } from "../core/atoms/transformable.js";
import { Coated, NO_COAT } from "../core/atoms/coated.js";
import { mark } from "../core/atoms/marked.js";
import { screened } from "../core/atoms/screened.js";
import { type ValuedFields } from "../core/atoms/valued.js";
import { apply, compose as composeTransforms, type Vec } from "../core/transform.js";
import { polar, velocityOf, type BoxWalls, type Walls } from "../core/ballistic.js";
import { RISE, type CarryItem, type Motions } from "./animator/index.js";
import { type Host } from "./host.js";

export interface FallScene {
  readonly host: Host;
  readonly motions?: Motions | undefined;
  readonly actor?: string | undefined;
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
/**
 * `toss` is `roll` with a condition: a die let go of gently is SET DOWN, face as it was, and it goes
 * over only when the hand threw it. A game with dice beside the board wants exactly this — a die
 * moved out of the way is not a throw, and a throw is the one thing that may change the number.
 */
export type LetGo = "settle" | "fall" | "roll" | "toss";

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
 * A THROW THAT WOULD NOT CARRY A PIECE THIS FAR IS A PUTTING-DOWN, in units.
 *
 * About a third of a card. Below it nothing that matters is different: the piece ends up where the
 * hand left it either way, and the only thing the flight adds is TIME — a stagger, a landing, and a
 * run reassembling itself, all to travel a distance nobody can see. Above it the hand plainly sent
 * the piece somewhere, and the flight is the picture of that.
 */
export const THROW_REACH = 0.35;

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
 * HOW WIDE THE FAN IS, degrees between one die of a run and the next.
 *
 * Wide enough that they part at once and narrow enough that a throw still goes where it was aimed:
 * a handful thrown at the far corner must arrive at the far corner, spread out, not sprayed across
 * the whole desk.
 */
export const DIE_FAN = 34;
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
 * HOW HARD A HANDFUL OF DICE PUSHES ITSELF APART, units/s — and it is a real throw, not a nudge.
 *
 * Two dice tipped out of a hand do not land side by side because somebody aimed them there; they
 * land apart because they were never going the same way. This is that: enough speed for each to
 * make its own way across the felt, so a drop of two reads as two dice thrown rather than as one
 * die that split.
 */
export const DIE_SCATTER = 2.6;
const DEFAULT_MAP = { w: 8, h: 8 };

export function threwAt(speed: number): number {
  return Math.max(0, speed - THROWN_AT);
}

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
/**
 * THE FLIGHT A HAND GIVES A PIECE, from a swing that is already the excess in units (`flickOf`).
 *
 * One multiplication and no threshold: the threshold was paid on the glass, in pixels, exactly
 * once. A second one here — the bug this function exists to keep out — compared units against a
 * pixel number and answered "not a throw" to every throw there is.
 */
export function flightOf(hand: Vec, throwGain: number): { speed: number; angle: number } {
  return { speed: Math.hypot(hand.x, hand.y) * throwGain, angle: polar(hand).angle };
}

/**
 * Does this piece FLY when the hand lets go at `speed`? Its own way of leaving, unless the hand was
 * moving fast enough to overrule it.
 */
export function thrown(piece: Node, speed: number, ways: Parameters<typeof dropOf>[1] = {}): boolean {
  return dropOf(piece, ways).fall !== "settle" || speed > 0;
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
  if (caps(piece).has("Rollable")) {
    const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
    const side = shape ? extentOf(shape).w : 0;
    return { fall: ways.die ?? "roll", throwGain: 1, gravity: 22, bounce: 0.7, wallBounce: 0.7, girth: side / 2, solid: "", scatter: DIE_SCATTER };
  }
  if (caps(piece).has("Flippable")) {
    return { fall: ways.card ?? "settle", throwGain: 0.9, friction: 4.5, gravity: 11, bounce: 0, wallBounce: 0.45, girth: 0, solid: "", scatter: 0 };
  }
  const values = fieldsOf<ValuedFields>(piece, "Valued")?.values;
  if (values?.["chip"] !== undefined) {
    return { fall: ways.chip ?? "fall", throwGain: 0.45, friction: 9, gravity: 20, bounce: 0.35, wallBounce: 0.5, girth: 0, solid: "", scatter: 0 };
  }
  return { fall: "fall", throwGain: 0.7, gravity: 26, bounce: 0.001, wallBounce: 0.001, girth: 0, solid: "", scatter: 0 };
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
 * Where each piece of a lifted heap stands, relative to the handle that lifted it.
 *
 * BY ITS BOTTOM CENTRE, not its middle. A handle is under a heap, and what is under a thing meets
 * it at its bottom edge — hung by their middles the pieces sit ON the tab with half of each below
 * it, which is a stack skewered on its own handle rather than one standing on it. The gap it stands
 * at is the gap it was DRAWN at (`GRIP_GAP`), so nothing moves relative to anything at the lift.
 */
export function stackSeats(group: readonly Node[], gripW = 0.6, want: Vec = STACK_STEP, thick = STACK_THICK): Vec[] {
  // The handle's proportions and the gap it is drawn at are the catalog's (`GRIP_RATIO`, `GRIP_GAP`
  // in its gesture map); the numbers are repeated here so the seats stay where the handle draws.
  const clear = gripW / 4 / 2 + 0.06;
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
export function mapWalls(piece: Node, lift = 1, box: { readonly w: number; readonly h: number } = DEFAULT_MAP): BoxWalls {
  const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
  const size = shape ? extentOf(shape) : { w: 0, h: 0 };
  // THE DESK'S OWN BOX, not the shelf's stock one. A desk wider than the map — a felt with a board
  // in the middle of it — walled at the map's size holds the hand inside the middle eight units of
  // fourteen: a man could be carried to the board's edge and no further, and the felt beyond it,
  // drawn and accepting, could never be reached.
  const x = box.w / 2 - (size.w * lift) / 2;
  const y = box.h / 2 - (size.h * lift) / 2;
  // A piece bigger than the map has nowhere to stand: the box collapses to the middle rather than
  // turning inside out, which is what a negative half would do.
  return { x0: Math.min(-x, 0), y0: Math.min(-y, 0), x1: Math.max(x, 0), y1: Math.max(y, 0) };
}

function kindOf(n: Node): string {
  if (caps(n).has("Rollable")) return "die";
  if (caps(n).has("Flippable")) return "card";
  const values = fieldsOf<ValuedFields>(n, "Valued")?.values;
  if (values?.["warm"] !== undefined) return "warm";
  if (values?.["grip"] !== undefined) return "grip";
  if (values?.["mark"] !== undefined) return "mark";
  if (values?.["chip"] !== undefined) return "chip";
  return "";
}

function isGrip(n: Node): boolean {
  return kindOf(n) === "grip";
}

function isMark(n: Node): boolean {
  return kindOf(n) === "mark";
}

function isDrawn(n: Node): boolean {
  return isGrip(n) || isMark(n);
}

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

/**
 * LET GO OF THE PIECES — they are in the air, and the air is where they are let go of.
 *
 * Three things happen, in this order and for a reason each:
 *
 *   THE SEAT IS WRITTEN FIRST. It is the truth — this is where the piece now lives — and a fall is
 *   only a look. A flight starts from the node's REST, so the seat has to be there before the drop
 *   is asked for, or the piece would fall at the place it was picked up from.
 *
 *   THE PIECE COMES TO THE FRONT. The last thing dropped covers what is under it, which is what a
 *   desk does; tree order and not a height, see `toFront`.
 *
 *   AND THEN IT FALLS, from exactly the height the hand was holding it at. The hand's height is a
 *   SCALE (`lift`) and a fall's is a LENGTH, and `RISE` is the one rate between them — asked here
 *   rather than guessed, because a second answer to it is a piece that jumps the instant it is
 *   released. How it comes down is the piece's own business (`dropOf`).
 *
 * `hand` is the speed the hand still had on it: absent, the piece drops where it stood; present, the
 * same fall carries that speed across the desk and the map's border reflects it. A slow release is
 * then not a special case at all — it is a throw of nearly no speed, which is a drop.
 */
/**
 * WHERE THIS ONE OF THE HANDFUL GOES — the fan, in degrees, or nothing at all.
 *
 * Counted from the middle outwards, so a run of two parts evenly about the throw and a run of one
 * is not fanned at all: a single die thrown goes where it was thrown, and a rule that nudged it
 * aside would be the desk disagreeing with the hand.
 */
export function fanOf(nth: number, of: number, aim: number): number | undefined {
  if (nth < 0 || of < 2) return undefined;
  return aim + (nth - (of - 1) / 2) * DIE_FAN;
}

/** Which way a handful goes when the hand had no direction of its own: away from the reader. */
const DOWN_THE_DESK = 90;
/** Two velocities as one — the throw the hand gave it plus its own share of the opening. */
const sum = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });

/** A node's own turn right now, in degrees — `0` for a node that has none, and for no node at all. */
function angleIn(n: Node | undefined): number {
  return n ? fieldsOf<TransformableFields>(n, "Transformable")?.angle ?? 0 : 0;
}

/** Where a node stands right now, in root units — the seat a landing or a release just wrote. */
export function seatIn(n: Node): Vec {
  return fieldsOf<TransformableFields>(n, "Transformable")?.at ?? { x: 0, y: 0 };
}

/**
 * THE SEAT A FLIGHT ENDED ON, written into the tree — in the flight's own frame.
 *
 * Composed and not fed through `setRoot`: the runtime reads the tree itself on the very frame a
 * landing is reported, so the seat is found equal and nothing flies. Routed through a notify it
 * would arrive a frame late, and that frame is the piece back at the hand.
 *
 * Root units are the seat's units here, as the map is the root and stands at the origin.
 */
export function landed(s: FallScene, id: string, at: { readonly at: Vec; readonly angle: number }): void {
  const n = byId(s.host.root, id);
  if (!n) return;
  const own = fieldsOf<TransformableFields>(n, "Transformable");
  // THE SEAT ONLY, never the turn. A flight reports its turn as the resting pose's own plus whatever
  // it spun, and the resting pose of a FACE-DOWN card is a mirror — a matrix a turn is read out of
  // as a half circle, because that is what a mirror looks like to `atan2`. Written back it lands the
  // card upside down. Nothing on this desk turns while it flies except the die, and the die writes
  // its own landing (`throwDie`), so there is no turn here to keep.
  compose(n, Transformable({ ...(own ?? {}), at: at.at }));
}

/**
 * EVERY PIECE OF A THROWN RUN, AIMED AT ITS OWN PLACE IN THE FORMATION — id to a throw that lands
 * exactly there. Empty when this run has no formation to keep.
 *
 * THE DESTINATION IS THE ANCHOR'S. A run carried by its handle is anchored on that handle: it is
 * what the hand had hold of and what the hand aimed, so where IT comes to rest is where the run
 * comes to rest (`restsAt`, the same arithmetic the zone is asked about). The pieces are then seated
 * around that point exactly as they are seated around the handle in the hand (`stackSeats`), which
 * is why the hand keeps its shape through the whole flight instead of being reassembled on arrival.
 *
 * A thrown run used to be a handful of separate throws that happened to share a hand: each piece
 * left from where the fan had put it and travelled its own distance, so the hand arrived on the felt
 * as the same spread it had been held in — a stack in name only, tidied up afterwards. Tidying up
 * after a landing is what a correction looks like.
 *
 * A THROW IS SOLVED, NOT GUESSED. A slide of speed `v` under drag `a` stops after `v²/2a`, so the
 * speed that stops at a given distance is `sqrt(2ad)`: the flight is aimed at the seat and ends
 * there, with the same slowing-down every other throw on the desk has.
 *
 * WHO FLIES LIKE THIS IS DATA AND NOT A KIND. A piece that scatters is being opened out on purpose,
 * and a piece that takes up room is going to be shoved by its neighbours anyway: either one aimed at
 * a seat would be aimed at a seat it cannot keep. What is left — a thing that neither scatters nor
 * takes room — is a card, and a hand of them lands as a hand.
 */
export function formationOf(
  s: FallScene,
  items: readonly CarryItem[],
  put: readonly Node[],
  falling: readonly Node[],
  hand: Vec | undefined,
  feelOf: (n: Node) => DropFeel,
): Map<string, { readonly speed: number; readonly angle: number; readonly friction: number }> {
  const out = new Map<string, { readonly speed: number; readonly angle: number; readonly friction: number }>();
  const first = items[0];
  const anchor = first ? put.find((n) => n.id === first.id && isGrip(n)) : undefined;
  // A run with no handle is a run of one, and one piece is its own formation.
  if (!anchor || !hand) return out;
  const flying = new Set(falling.map((n) => n.id));
  const run = put.filter((n) => !isDrawn(n) && flying.has(n.id) && feelOf(n).scatter === 0 && feelOf(n).girth === 0);
  const feel = run[0] ? feelOf(run[0]!) : undefined;
  if (!feel) return out;
  const drag = feel.friction ?? s.motions?.tuning().friction ?? 0;
  if (drag <= 0) return out;
  // The run travels as ONE, so the anchor is carried by the run's own physics and not by a control's.
  flockTo(run, seatIn(anchor), hand, feel, drag).forEach((throwAt, i) => {
    const piece = run[i];
    if (piece) out.set(piece.id, throwAt);
  });
  return out;
}

export function letFall(
  s: FallScene,
  items: readonly CarryItem[],
  lift: number,
  hand?: Vec | undefined,
  after?: () => void,
  ways: { card?: LetGo; chip?: LetGo; die?: LetGo } = {},
  bump?: Bump,
  hover: Vec = { x: 0, y: 0 },
  onRoll?: (m: Motions, root: Node, piece: Node, opts: any) => void,
  wallsOf?: (piece: Node, at: Vec) => Walls | undefined,
  /**
   * THE TURN THE HOLDER HAD IT AT (`holderTurn`), when the run asked to lie the way it was held.
   *
   * A throw is a release the SCENE takes: it never reaches the wiring's own drop, which is where a
   * holder-facing piece has its turn written into the tree. So the number arrives here too, or the
   * card is drawn upright in the hand for the whole carry and comes down pointing north.
   *
   * Absent means "nobody asked", and that is not the same as zero: writing a default would flatten
   * whatever angle the game itself had put on the piece.
   */
  orientDeg?: number | undefined,
): boolean {
  const m = s.motions;
  const drawn = m?.poses();
  if (!m || !drawn) return false;
  const root = s.host.root;
  const put: Node[] = [];
  // THE LEAD'S OWN TURN, READ BEFORE ANYTHING IS WRITTEN. A run keeps its shape: the piece the hand
  // had hold of goes to the holder's turn, and the rest are moved by the same amount, so a fan let
  // go of turned is the same fan. Read afterwards it would be the turn already written.
  const base0 = orientDeg === undefined ? 0 : angleIn(byId(root, items[0]?.id ?? ""));
  for (const it of items) {
    const n = byId(root, it.id);
    const pose = drawn.get(it.id);
    if (!n || !pose) return false;
    if (n.parent && n.parent !== root) {
      remove(n.parent, n);
      add(root, n);
    }
    const at = apply(pose, { x: 0, y: 0 });
    const own = fieldsOf<TransformableFields>(n, "Transformable");
    compose(n, Transformable({
      ...(own ?? {}),
      at: isDrawn(n) ? at : { x: at.x - hover.x, y: at.y - hover.y },
      // NOT READ BACK OFF THE DRAWN POSE. A carried pose is the piece's resting pose with the style
      // composed onto it, so a face-down card's mirror is in the matrix and `atan2` reads it as a
      // half circle — the same trap `landed` names below. The turn is DATA, and it is handed in.
      ...(orientDeg === undefined ? {} : { angle: (own?.angle ?? 0) + orientDeg - base0 }),
    }));
    toFront(n);
    m.release(it.id);
    put.push(n);
  }
  const speed = hand ? Math.hypot(hand.x, hand.y) : 0;
  const falling = put.filter((n) => thrown(n, speed, ways));
  const feelOf = (n: Node): DropFeel => bumped(dropOf(n, ways), n, bump);
  const scattering = falling.filter((n) => feelOf(n).scatter > 0);
  const flock = formationOf(s, items, put, falling, hand, feelOf);
  const aim = hand && (hand.x !== 0 || hand.y !== 0) ? polar(hand).angle : DOWN_THE_DESK;
  const dropped = fallOrder(falling, flock).map(({ piece, delayMs }) => ({
    id: piece.id,
    feel: feelOf(piece),
    fan: fanOf(scattering.indexOf(piece), scattering.length, aim),
    // THE DESK SAYS WHERE A FLIGHT MAY GO, when it has an opinion — asked with the piece where it is
    // being let go of, because that is what decides it: a die thrown from beside a board stays beside
    // it, a die thrown on the board stays on the board, and only the point of release tells which.
    // A desk that says nothing gets the map's own border, as every desk on this shelf did.
    walls: wallsOf?.(piece, seatIn(piece)) ?? mapWalls(piece),
    delayMs,
  }));
  const standing = alsoInTheWay(
    root,
    new Set(dropped.map((d) => d.id)),
    new Set(dropped.filter((d) => d.feel.girth > 0).map((d) => d.feel.solid)),
    feelOf,
  );
  const fromPositions = new Map<string, Vec>();
  for (const it of items) {
    const n = byId(s.host.root, it.id);
    if (n) fromPositions.set(it.id, seatIn(n));
  }
  // ONE MARK PER TOUCH, NEVER ONE PER CARD. A release is a single gesture, however many pieces it
  // let go of — a whole stack thrown at once is one throw, not thirty-six, and a mark on every card
  // of it reads as a border painted around the pile rather than a note about the hand that moved it.
  // So only the first piece a release actually flies is marked; the rest of the run says nothing on
  // its own, which is what a stack lying in one ink already says.
  //
  // WRITTEN BEFORE `after?.()`, when nothing here is going to fly. `after` is what tells the far
  // screen to look again (`mirror.changed()`, through `settle()`), and a calm release only ever
  // gets that ONE call — a card set down without a swing schedules no flight, so there is no later
  // `onDone` to carry a second one. A mark composed after that call had already gone out is a mark
  // the other screen was never told to look for.
  const willFly = dropped.some(({ id, feel }) => {
    const seat = flock.get(id);
    const flight = seat ?? (hand ? flightOf(hand, feel.throwGain) : { speed: 0, angle: 0 });
    return flight.speed > 0;
  });
  let marked = false;
  if (s.actor && !willFly && items[0]) {
    const lead = byId(s.host.root, items[0].id);
    // A CONTROL IS NOT MARKED. A mark is a note about a PIECE — who moved it and from where — and
    // the far screen paints the owner's ink around whatever carries one. A seat's own ring, a
    // handle, an avatar: none of them is a thing lying on the felt, so a hand that shifted one made
    // no move to report. Read off the atom that already says "held at its size on the glass"
    // (`Screened`), never off a name — a desk names its own furniture and the kit parses none of it.
    if (lead && !screened(lead)) {
      const from = fromPositions.get(items[0].id);
      mark(lead, { by: s.actor, mark: "moved", ...(from ? { from } : {}) });
      marked = true;
    }
  }
  s.host.setRoot(root);
  const knocking = shoves(speed, bump?.holds ?? false);
  for (const still of standing) {
    const feel = feelOf(still);
    m.slide(still.id, {
      speed: 0,
      angle: 0,
      girth: feel.girth,
      solid: feel.solid,
      ...(knocking ? {} : { anchored: true }),
      bodyBounce: feel.bodyBounce ?? feel.bounce,
      ...(feel.friction === undefined ? {} : { friction: feel.friction }),
      walls: mapWalls(still),
      wallKick: 0,
      onDone: (at) => landed(s, still.id, at),
    });
  }
  after?.();
  let left = dropped.length;
  for (const { id, feel, walls, delayMs, fan } of dropped) {
    const seat = flock.get(id);
    const flight = seat ?? (hand ? flightOf(hand, feel.throwGain) : { speed: 0, angle: 0 });
    if (s.actor && flight.speed > 0 && !marked) {
      const piece = byId(s.host.root, id);
      // NOT A CONTROL, on this path either — see the calm release above.
      if (piece && !screened(piece)) {
        const from = fromPositions.get(id);
        mark(piece, { by: s.actor, mark: "thrown", ...(from ? { from } : {}) });
        marked = true;
      }
    }
    const own = fan === undefined ? flight : polar(sum(velocityOf(flight.speed, flight.angle), velocityOf(feel.scatter, fan)));
    const body = {
      ...own,
      ...(seat ? { friction: seat.friction } : feel.friction === undefined ? {} : { friction: feel.friction }),
      ...(delayMs > 0 ? { delayMs } : {}),
      up: (lift - 1) / RISE,
      gravity: feel.gravity,
      bounce: feel.bounce,
      wallBounce: feel.wallBounce,
      wallKick: 0,
      walls,
      ...(feel.girth > 0 ? { girth: feel.girth } : {}),
      ...(feel.bodyBounce === undefined ? {} : { bodyBounce: feel.bodyBounce }),
      ...(feel.solid ? { solid: feel.solid } : {}),
    };
    const piece = byId(s.host.root, id);
    if (piece && (feel.fall === "roll" || (feel.fall === "toss" && flight.speed > 0)) && onRoll) {
      onRoll(m, s.host.root, piece, {
        ...body,
        spin: DIE_SPIN * (Math.sign(hand?.x ?? 0) || 1),
        spinFriction: DIE_SPIN_DRAG,
        hop: DIE_HOP,
        outcome: { rng: Math.random },
        onRest: () => {
          if (--left <= 0) after?.();
        },
      });
      continue;
    }
    m.slide(id, {
      ...body,
      onDone: (at) => {
        landed(s, id, at);
        if (--left <= 0) after?.();
      },
    });
  }
  return true;
}
