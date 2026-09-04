// THE FALL RUNTIME — throw, drop, and settle mechanics for the kit's scenes.
//
// When a gesture ends, what a hand was holding is let go of: slow hands settle, fast hands throw,
// and heavy things fall. Everything here is pure kit data and ballistic calculations.

import { add, byId, caps, compose, fieldsOf, node, remove, reorder, type Node, type NodeId } from "../core/node.js";
import { extentOf, type BoundedFields } from "../core/atoms/bounded.js";
import { Transformable, type TransformableFields } from "../core/atoms/transformable.js";
import { Coated, NO_COAT } from "../core/atoms/coated.js";
import { mark } from "../core/atoms/marked.js";
import { type ValuedFields } from "../core/atoms/valued.js";
import { apply, compose as composeTransforms, type Vec } from "../core/transform.js";
import { polar, velocityOf, type Walls } from "../core/ballistic.js";
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
export type LetGo = "settle" | "fall" | "roll";

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

/** How long apart the pieces of a dropped heap leave the hand, ms. */
export const STACK_FALL_STEP = 55;

/** HOW LONG A POUR MAY LAST ALL TOLD, ms, however many pieces are in it. */
export const STACK_POUR = 620;

export const DIE_FAN = 34;
export const DIE_HOP = 0.08;
export const DIE_SPIN = 720;
export const DIE_SPIN_DRAG = 5;
const DIE_SCATTER = 3.5;
const DEFAULT_MAP = { w: 8, h: 8 };

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
  const far = drag > 0 ? (flick / perUnit) ** 2 / (2 * drag) : Infinity;
  return far >= THROW_REACH ? world : undefined;
}

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
 */
export function restsAt(from: Vec, hand: Vec | undefined, feel: DropFeel, friction: number): Vec {
  if (!hand) return from;
  const speed = Math.hypot(hand.x, hand.y) * feel.throwGain;
  const drag = feel.friction ?? friction;
  if (speed <= 0 || drag <= 0) return from;
  const far = (speed * speed) / (2 * drag);
  return { x: from.x + (hand.x / Math.hypot(hand.x, hand.y)) * far, y: from.y + (hand.y / Math.hypot(hand.x, hand.y)) * far };
}

const STACK_STEP = { x: 0.012, y: -0.03 };
const STACK_THICK = 0.22;

export function stackSeats(group: readonly Node[], gripW = 0.6, want: Vec = STACK_STEP, thick = STACK_THICK): Vec[] {
  const clear = gripW / 4 / 2 + 0.06;
  const spread = Math.max(1, group.length - 1);
  const fit = Math.min(1, thick / (Math.abs(want.y) * spread));
  const step = { x: want.x * fit, y: want.y * fit };
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
  const pull = feel.friction ?? drag;
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
 */
export function roomBy(piece: Node, factor: number): number {
  const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
  const size = shape ? extentOf(shape) : { w: 0, h: 0 };
  return (Math.min(size.w, size.h) / 2) * factor;
}

/**
 * IT MOVES NOTHING BUT THE VIEW. The desk's border is still a wall to the PIECES (`mapWalls`)
 */
export function mapWalls(piece: Node, lift = 1, box: { readonly w: number; readonly h: number } = DEFAULT_MAP): Walls {
  const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
  const size = shape ? extentOf(shape) : { w: 0, h: 0 };
  const x = box.w / 2 - (size.w * lift) / 2;
  const y = box.h / 2 - (size.h * lift) / 2;
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
 */
export function fallOrder(
  pieces: readonly Node[],
  together: ReadonlyMap<string, unknown> = new Map(),
): { readonly piece: Node; readonly delayMs: number }[] {
  const falling = pieces.filter((n) => !isDrawn(n));
  const gaps = Math.max(1, falling.length - 1);
  const step = Math.min(STACK_FALL_STEP, STACK_POUR / gaps);
  return falling.map((piece, i) => ({ piece, delayMs: together.has(piece.id) ? 0 : Math.round(i * step) }));
}

/**
 * PUT A PIECE ON TOP of everything else on the desk — the last thing dropped covers what is under it.
 */
export function toFront(piece: Node): void {
  const owner = piece.parent;
  if (!owner) return;
  const i = owner.children.indexOf(piece);
  if (i < 0 || i === owner.children.length - 1) return;
  reorder(owner, [...owner.children.keys()].filter((k) => k !== i).concat(i));
}

export function fanOf(nth: number, of: number, aim: number): number | undefined {
  if (nth < 0 || of < 2) return undefined;
  return aim + (nth - (of - 1) / 2) * DIE_FAN;
}

const DOWN_THE_DESK = 90;
const sum = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });

export function seatIn(n: Node): Vec {
  return fieldsOf<TransformableFields>(n, "Transformable")?.at ?? { x: 0, y: 0 };
}

export function landed(s: FallScene, id: string, at: { readonly at: Vec; readonly angle: number }): void {
  const n = byId(s.host.root, id);
  if (!n) return;
  const own = fieldsOf<TransformableFields>(n, "Transformable");
  compose(n, Transformable({ ...(own ?? {}), at: at.at }));
}

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
  if (!anchor || !hand) return out;
  const flying = new Set(falling.map((n) => n.id));
  const run = put.filter((n) => !isDrawn(n) && flying.has(n.id) && feelOf(n).scatter === 0 && feelOf(n).girth === 0);
  const feel = run[0] ? feelOf(run[0]!) : undefined;
  if (!feel) return out;
  const drag = feel.friction ?? s.motions?.tuning().friction ?? 0;
  if (drag <= 0) return out;
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
): boolean {
  const m = s.motions;
  const drawn = m?.poses();
  if (!m || !drawn) return false;
  const root = s.host.root;
  const put: Node[] = [];
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
    compose(n, Transformable({ ...(own ?? {}), at: isDrawn(n) ? at : { x: at.x - hover.x, y: at.y - hover.y } }));
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
    walls: mapWalls(piece),
    delayMs,
  }));
  const standing = alsoInTheWay(
    root,
    new Set(dropped.map((d) => d.id)),
    new Set(dropped.filter((d) => d.feel.girth > 0).map((d) => d.feel.solid)),
    feelOf,
  );
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
  const fromPositions = new Map<string, Vec>();
  for (const it of items) {
    const n = byId(s.host.root, it.id);
    if (n) fromPositions.set(it.id, seatIn(n));
  }

  for (const { id, feel, walls, delayMs, fan } of dropped) {
    const seat = flock.get(id);
    const flight = seat ?? (hand ? flightOf(hand, feel.throwGain) : { speed: 0, angle: 0 });
    if (s.actor && flight.speed > 0) {
      const piece = byId(s.host.root, id);
      if (piece) {
        const from = fromPositions.get(id);
        mark(piece, { by: s.actor, mark: "thrown", ...(from ? { from } : {}) });
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
    if (piece && feel.fall === "roll" && onRoll) {
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
