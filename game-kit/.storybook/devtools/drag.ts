// THE CATALOG'S DRAG WIRING — what a game writes around `Draggable`, in one place.
//
// The atom is DATA (`onReject` — where a refused card goes); the finger work is the consumer's,
// and this is that consumer for the catalog's scenes: pointerdown picks a draggable off the plan
// and hands the run to the clock (`grab`), pointermove retargets the chase spring (`dragTo` — one
// paint, never a tree write), pointerup decides the drop and releases. A game writes exactly this
// shape around its own rules — the solitaire add-on is the full-sized version of this file.
//
// Wired ONCE per scene and then re-tuned: Storybook re-runs a story's render on every control
// change, and the scene shell answers with the same standing canvas — a second set of listeners
// on it would grab every card twice. So the wiring keeps per-element state and a repeat call only
// replaces the knobs.

import {
  applyMove,
  byId,
  compose,
  draggable,
  fieldsOf,
  restAngle,
  rotatable,
  glassOf,
  onRejectOf,
  pick,
  planMove,
  toUnits,
  transformsOf,
  Transformable,
  add,
  extentOf,
  FLING,
  remove,
  type BoundedFields,
  type CarryOptions,
  type OccupiedOutcome,
  wearInvites,
  wearKeen,
  type CarryItem,
  type CarryTuning,
  type Node,
  type Point,
  type NodeId,
  type Transform,
  type TransformableFields,
  type Vec,
  type WallHit,
  type Walls,
} from "../../src/index.js";
import { type Scene } from "./scene.js";

/**
 * The carry's feel — the carry fields of `MotionTuning`, by their own names, handed to `grab` as the
 * per-gesture patch — plus the two things a scene has to say about its own rules.
 */
export type DragOptions = { readonly [K in keyof CarryTuning]?: CarryTuning[K] | undefined } & {
  /** The run a grabbed node leads. Absent, a card travels alone. */
  readonly runOf?: ((root: Node, hit: Node) => readonly Node[]) | undefined;
  /**
   * WHERE EACH MEMBER OF THE RUN STANDS while it is carried, relative to the anchor — instead of
   * where it happens to be lying.
   *
   * Absent, a run keeps its shape: a column picked up in the middle stays the column it was, which
   * is what every drag on this shelf wants. Present, the run is ARRANGED as it is lifted — pull a
   * handle under a heap of touching cards and they come up as one squared stack rather than as the
   * heap they were. The arrangement has to happen at the LIFT and not at the drop: a hand closing on
   * a heap is the moment a player expects it to become a thing, and a heap that stayed a heap all
   * the way across the desk and squared up only when let go reads as the desk tidying up after them.
   */
  readonly offsetOf?: ((root: Node, hit: Node, run: readonly Node[]) => readonly Vec[] | undefined) | undefined;
  /**
   * THE FEEL FOR THIS ONE GESTURE, over the wiring's own — a patch, asked at the moment of the grab.
   *
   * The feel is usually the SCENE's: one desk, one weight of hand. But a scene can hold a thing that
   * is not a piece — a handle drawn under a heap — and a handle has no physics of its own to have.
   * It IS the grab: it must sit exactly under the finger, at the size it was drawn, at the distance
   * from its heap it was drawn at. A pop or a bank on it would be the control itself moving away
   * from the hand that is holding it.
   */
  /**
   * WHICH MEMBERS OF THE RUN ARE THE HAND'S OWN — a flag per member, `true` for one that takes no
   * lift and no lean. A handle is one: a control that popped would be the thing you have hold of
   * growing in your hand, while what hangs off it is being picked up like anything else.
   */
  readonly stillOf?: ((root: Node, hit: Node, run: readonly Node[]) => readonly boolean[] | undefined) | undefined;
  readonly feelOf?: ((root: Node, hit: Node) => { readonly [K in keyof CarryTuning]?: CarryTuning[K] | undefined } | undefined) | undefined;
  /**
   * An EXTRA gate on the pick, beside `draggable` — the seat's permission, usually: a story
   * passes `(n) => grippableBy(n, seat)` and the other player's hand refuses the finger.
   */
  readonly may?: ((n: Node) => boolean) | undefined;
  /**
   * Called on release BEFORE the ordinary drop, with the finger's speed (root units/s) and the
   * released nodes: a scene that throws on release (a die) does its throw here and returns `true`
   * to say it took the nodes; `false`/absent, and the drop is refused-or-stays as always.
   */
  readonly onRelease?: ((velocity: Vec | undefined, items: readonly CarryItem[]) => boolean) | undefined;
  /**
   * The tray the grabbed piece may not be carried out of — asked of the scene at the moment of the
   * grab, because which box a piece is in is the game's knowledge, not the wiring's. The box is the
   * ANCHOR's, so inset it by the piece's own half (`wallsOf(root, tray, half)`).
   */
  readonly trayOf?: ((root: Node, hit: Node) => Walls | undefined) | undefined;
  /**
   * The wall won and the run is off the finger, still standing on the border. Like `onRelease`: a
   * scene that throws the piece back does it here and returns `true` to say it took the nodes;
   * `false`/absent and the run is dropped where the wall stopped it.
   */
  readonly onWall?: ((hit: WallHit, items: readonly CarryItem[]) => boolean) | undefined;
  /** The view the desk is drawn through — a camera's `transform()`. Absent, the plain centred one. */
  readonly view?: (() => Transform) | undefined;
  /**
   * WHICH CONTAINER THE FINGER LET GO OVER — and with it, the whole drop. Absent, every release is
   * a refused one, which is what every scene here did before zones existed: the piece stays or
   * flies home and no tree changes owner.
   *
   * A callback and not a pick of our own, for the reason `trayOf` and `runOf` are callbacks: which
   * node counts as a drop TARGET is the game's knowledge. A plain pick answers with the topmost
   * thing drawn, and over a zone holding cards that is a card.
   *
   * The PIECE comes too, because "is it over the zone" is not the only question a desk may ask: a
   * zone that forgives a near miss has to measure from the piece's own edge, and a point cannot say
   * where a card's edge is (`Mechanics/Magnetism`).
   *
   * The PIECE comes too, because "is it over the zone" is not the only question a desk may ask: a
   * zone that forgives a near miss has to measure from the piece's own edge, and a point cannot say
   * where a card's edge is (`Mechanics/Magnetism`).
   */
  readonly zoneAt?: ((root: Node, at: Vec, lead: Node) => Node | undefined) | undefined;
  /**
   * WHICH ZONE WOULD TAKE THIS RUN IF THE HAND LET GO NOW — asked on every move, so the zone that
   * is going to get it can SAY SO while there is still time to aim somewhere else.
   *
   * A zone reaches past its own border, so the border cannot answer "have I got there yet": carried
   * across the felt, a player has only their own guess, and finds out they missed by missing.
   *
   * Its own seam rather than `zoneAt` reused, because the two are asked in different states. A
   * release knows the point the piece was let go of and a throw knows where it will come to rest;
   * a carry in flight knows neither, and a run led by a HANDLE cannot even be asked through
   * `zoneAt` — the lead of such a run is a control, and a zone takes pieces, not controls. Absent,
   * the wiring falls back to `zoneAt` about the run's first piece, which is the whole answer on a
   * desk where a hand carries one thing.
   *
   * `at` IS HANDED OVER because nothing else can supply it. A carry is an override and never a tree
   * write, so the tree still says the deck the card came out of, and a desk that went looking for
   * the run's pose would measure the distance from a card that is no longer there. The hand knows,
   * and the hand is here: this is the same point the drop is going to use, walls and all.
   */
  readonly aimAt?: ((root: Node, ids: readonly NodeId[], at: Vec) => Node | undefined) | undefined;
  /**
   * THE FINGER IS THE HOLDER: the run is anchored ON it, not where the piece happened to be grabbed.
   *
   * Off — the stock answer — the finger-to-origin offset rides the whole gesture, so a piece does
   * not jump under the hand when it is picked up. That is right for a desk where what you take stays
   * under your finger, and wrong for one where it is LIFTED clear of it: there the load is drawn off
   * the finger anyway, so keeping the grab offset buys nothing and costs the one thing that matters
   * — the picture of where this lands ends up wherever you happened to touch, half a card from the
   * finger pointing at it, and two players aiming at the same spot put their cards in two places.
   */
  readonly underFinger?: boolean | undefined;
  /**
   * THE DROP, TAKEN OVER — called once a zone has been found and before anything is moved. Return
   * `true` and the wiring does nothing else: the scene has taken the drop.
   *
   * It exists for the case the tree on this glass is not the truth. A live desk shows every seat a
   * PROJECTION, and a card dropped on one screen has to change owner in the board everyone shares,
   * not in the copy one pair of eyes was handed — otherwise the move is real for one screen and
   * never happened for the others. Ids survive a projection, so the scene has everything it needs
   * to find the same nodes in the truth.
   */
  readonly onDrop?: ((drop: { readonly lead: Node; readonly target: Node; readonly seat: Vec }) => boolean) | undefined;
  /**
   * THE GESTURE ITSELF, as it happens — grabbed, moving, let go. Ephemeral: nothing here is truth,
   * and a consumer that ignores it loses nothing but the presence of other hands on a live desk.
   *
   * Separate from `onDrop` because they answer different questions and travel different channels: a
   * drop is a proposal about where a card BELONGS, a gesture is a picture of a hand in motion. One
   * is judged and echoed; the other is retransmitted and forgotten.
   */
  readonly onCarry?: ((carry: { readonly ids: readonly NodeId[]; readonly at: Vec; readonly done: boolean; readonly feel: Omit<CarryOptions, "anchor" | "walls" | "onWall" | "onSnap"> }) => void) | undefined;
  /**
   * THE GESTURE IS OVER AND THE TREE NOW SAYS WHERE EVERYTHING IS — the last thing that happens.
   *
   * It exists because `onCarry`'s `done` does NOT mean that: a carry is a picture of a hand, and the
   * hand is finished before the drop has been decided, let alone written. A scene that redrew
   * anything from the tree at `done` would be reading the seats the pieces had BEFORE they were put
   * down — which is a handle under the heap that used to be there.
   *
   * Called once per gesture, whichever way the drop went: taken by a zone, written where the finger
   * let go, or refused and left to fly home. It is told WHICH pieces settled, because "what just
   * arrived" is a different question from "what is on the desk" and a scene usually needs both.
   */
  readonly onSettled?: ((root: Node, ids: readonly NodeId[]) => void) | undefined;
  /**
   * A TAP — the gesture that picked something up and put it straight back down.
   *
   * It is reported HERE, and not by a second listener of its own, because a tap and a drag are the
   * same gesture until the moment it ends: the same finger lands on the same piece, and what tells
   * them apart is only how long it stayed and how far it went. Wired separately they would both
   * fire, and the scene would be left comparing them — which is the branch this seam exists to not
   * have. A gesture reports itself once, as whichever of the two it turned out to be.
   *
   * A tap is NOT a drop. The piece never went anywhere, so there is nothing to put down, nothing to
   * throw and nothing to announce as settled — the carry is simply given up and the piece eases back
   * to the seat it never left.
   */
  readonly onTap?: ((piece: Node) => void) | undefined;
  /**
   * HOW MUCH OF ITSELF A PIECE MUST SHOW to take the finger — see `pick`. Absent, the plain answer:
   * the topmost thing under the point, however little of it there is.
   *
   * A desk of things that lie on top of each other needs it. Most of what is under the top of a pile
   * is a sliver of edge a few pixels wide, and a finger that lands on one gets a card nobody was
   * aiming at; above this much showing it answers, below it the finger goes to whatever covers it.
   */
  readonly showsEnough?: number | undefined;
};

/** The run a card leads in a column: itself and every draggable sibling after it in tree order. */
export function runBelow(_root: Node, hit: Node): readonly Node[] {
  const siblings = hit.parent?.children ?? [hit];
  return siblings.slice(siblings.indexOf(hit)).filter(draggable);
}

/** A piece being turned by two fingers: which node, where the fingers started, and its own angle. */
interface Turn {
  readonly id: string;
  readonly second: number;
  readonly from: number;
  readonly startDeg: number;
}

interface Wiring {
  opts: DragOptions;
  /** The turn in hand, if the second finger has landed on a `Rotatable` piece. */
  turn: Turn | undefined;
  /**
   * `pointer` is the finger that grabbed, and every other one is ignored until it lets go.
   *
   * Without it a second finger — the one that arrives to pinch the desk — drives somebody else's
   * drag: the card chases a hand that never touched it, and lands wherever that hand stopped.
   */
  drag:
    | {
        readonly items: readonly CarryItem[];
        readonly delta: Point;
        readonly pointer: number;
        readonly tray: Walls | undefined;
        /** Where and when the finger landed — the whole of telling a tap from a carry. */
        readonly from: Point;
        readonly atMs: number;
        readonly hit: Node;
        /**
         * WHAT THE CLOCK WAS TOLD THIS CARRY FEELS LIKE — the knobs and the desk's own word for this
         * piece, merged exactly as the grab merged them.
         *
         * Kept so it can be REPORTED. A hand mirrored to another screen without its feel is not the
         * same hand: the near screen splays a deck into an accordion behind the finger and the far
         * one slides a brick, and two people watching one board plainly see two different desks.
         */
        readonly feel: Omit<CarryOptions, "anchor" | "walls" | "onWall" | "onSnap">;
      }
    | undefined;
  /** Undresses every zone the grab invited — release calls it, and it is the whole protocol. */
  undoInvites: (() => void) | undefined;
  /** The zone currently lit as the one that would TAKE this, and the call that unlights it. */
  keen: { readonly zone: Node; readonly off: () => void } | undefined;
  /**
   * THE FINGER'S OWN SPEED, in GLASS PIXELS PER SECOND, kept while a drag is under way.
   *
   * Measured here because here is where the finger is. The alternative — reading the carry's chase
   * springs and converting back out through the camera — is three conversions deep: the finger's
   * pixels are divided by the scale to become units, fed to a spring, the SPRING'S velocity is read
   * instead of the hand's, and then multiplied by the zoom to undo the first division. Every one of
   * those is a place to be wrong by a factor nobody can see on the glass, and one of them was.
   *
   * A hand's speed on a screen is a thing that is simply known: two points and the time between them.
   */
  swing: { v: Point; at: Point; ms: number } | undefined;
}

const WIRED = new WeakMap<HTMLElement, Wiring>();

/** Every pointer currently down on the view, so the second one can be measured against the first. */
const DOWN = new WeakMap<HTMLElement, Map<number, Point>>();

/**
 * How far a finger may wander and still have TAPPED, in glass pixels, and how long it may stay.
 *
 * The slop is a finger's own tremble on a phone, not a decision: nobody holding a card still means
 * to move it three pixels. The span is what separates "touched it" from "took hold of it" — long
 * enough that a deliberate press is never mistaken for a tap, short enough that a tap never feels
 * like it has to be hurried.
 */
const TAP_SLOP = 8;
const TAP_MS = 300;

/** The angle of the line between two glass points, in degrees clockwise — the screen's convention. */
const lineAngle = (a: Point, b: Point): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** A node's own angle right now, which is where a released turn may be sent back to. */
const angleOf = (n: Node): number => fieldsOf<TransformableFields>(n, "Transformable")?.angle ?? 0;

/**
 * FOLD ONE MORE SAMPLE INTO THE HAND'S SPEED — two points and the time between them, smoothed.
 *
 * SMOOTHED, because one jittery frame must not become the throw: a finger reports its position at
 * whatever rate the device feels like, and a single short interval between two nearly identical
 * points reads as a violent flick. Half of the newest sample is the kit's own answer to that
 * (`FLING.smoothing`), settled by hand against a real finger for the camera and true of any finger.
 *
 * A LONG GAP IS A HAND AT REST, not a slow one. Past `FLING.maxGap` the finger stopped moving and
 * started again, so what came before is not part of this motion — which is exactly the case of
 * carrying a card, pausing over the spot, and letting go: a putting-down, and it must not inherit
 * the speed the hand had on the way there.
 */
function trackSwing(w: Wiring, at: Point, ms: number): void {
  const was = w.swing;
  if (!was) return;
  const dt = (ms - was.ms) / 1000;
  if (dt <= 0) return;
  if (dt > FLING.maxGap) {
    w.swing = { v: { x: 0, y: 0 }, at, ms };
    return;
  }
  const fresh = { x: (at.x - was.at.x) / dt, y: (at.y - was.at.y) / dt };
  const keep = 1 - FLING.smoothing;
  w.swing = {
    v: { x: fresh.x * FLING.smoothing + was.v.x * keep, y: fresh.y * FLING.smoothing + was.v.y * keep },
    at,
    ms,
  };
}

/** Attach the demo drag to an `animate` scene (idempotent), and hand the scene back. */
export function wireDrag(s: Scene, opts: DragOptions = {}): Scene {
  const standing = WIRED.get(s.el);
  if (standing) {
    standing.opts = opts; // the same canvas, new knobs — never a second set of listeners
    return s;
  }
  const w: Wiring = { opts, drag: undefined, turn: undefined, undoInvites: undefined, keen: undefined, swing: undefined };
  WIRED.set(s.el, w);
  const view = s.host.view;

  const onDown = (e: PointerEvent): void => {
    const motions = s.motions;
    if (!motions) return;
    const downs = DOWN.get(s.el) ?? new Map<number, Point>();
    DOWN.set(s.el, downs);
    downs.set(e.pointerId, glassOf(view, e));
    // A SECOND FINGER ON A PIECE ALREADY IN HAND IS A TURN, not a second drag.
    //
    // The carry is given up first, and deliberately: a carried node's pose is laid out entirely by
    // the carry style — anchor, offset, lean, lift — so an angle written into the tree while it is
    // in flight is a write nothing reads. Released, the piece eases back to where the tree says it
    // is (a few pixels, since a turn starts on a piece that is lying still), and from there the
    // angle is the only thing moving.
    if (w.drag && !w.turn) {
      const lead = byId(s.host.root, w.drag.items[0]!.id);
      const first = downs.get(w.drag.pointer);
      if (lead && first && rotatable(lead)) {
        for (const it of w.drag.items) motions.release(it.id);
        w.undoInvites?.();
        w.undoInvites = undefined;
        aim(undefined);
        w.drag = undefined;
        // NO threshold here, unlike the camera's twist. There the slop exists because every pinch
        // is a little bit of a twist and a plain zoom must not turn the desk; two fingers on a
        // piece that turns mean one thing only, and a dead zone would just be lag.
        w.turn = { id: lead.id, second: e.pointerId, from: angleOf(lead), startDeg: lineAngle(first, glassOf(view, e)) };
        motions.hold(lead.id); // finger-owned: the angle is written, never eased towards
        return;
      }
    }
    if (w.drag || w.turn) return;
    const root = s.host.root;
    const g = glassOf(view, e);
    // Only a draggable lifts — and only one the gate lets through: the pick reads the SAME plan
    // the painter drew, so what refuses the finger is exactly what the eye sees refuse it.
    // Through the clock's own poses: the finger tests what the EYE sees, so a die halfway across a
    // tray answers to a touch on the die and not to one on the seat it left.
    // THROUGH WHAT CAN BE REACHED, not through what is drawn: a card turning over is squeezed to its
    // own edge halfway through, and a hit box that followed it there would let the finger fall
    // through to the card beneath — a fast hand would turn over two and then three. See
    // `Motions.reach`. Where a piece has genuinely MOVED — carried, thrown — it is still reached
    // where it is, which is the same map.
    const hit = pick(
      s.host,
      root,
      g,
      (n) => draggable(n) && (w.opts.may?.(n) ?? true),
      w.opts.view?.(),
      s.motions?.reach(),
      w.opts.showsEnough,
    );
    if (!hit) return;
    const run = w.opts.runOf ? w.opts.runOf(root, hit) : [hit];
    // WHERE THE PIECES ARE DRAWN, not where they rest: the hand closes on what it can see. A piece
    // the clock is moving rests somewhere it left long ago, and an anchor taken from the tree would
    // teleport a caught die back to its seat the instant the finger touched it.
    const drawn = s.motions?.poses();
    const tree = transformsOf(root);
    const poses = new Map(tree);
    if (drawn) for (const [id, t] of drawn) if (tree.has(id)) poses.set(id, t);
    const at = poses.get(hit.id);
    if (!at || run.length === 0) return;
    const anchor = { x: at.e, y: at.f };
    const p = toUnits(s.host, g, w.opts.view?.());
    // ARRANGED, when the scene says so, and otherwise as it lies. The offsets are the whole of the
    // difference: the carry lays the run out from them on its very first frame, so a heap lifted by
    // its handle is already a stack before it has travelled a pixel.
    const arranged = w.opts.offsetOf?.(root, hit, run);
    const own = w.opts.stillOf?.(root, hit, run);
    const items = run.map((c, i) => {
      const still = own?.[i] ? { still: true } : {};
      const seat = arranged?.[i];
      if (seat) return { id: c.id, offset: seat, ...still };
      const t = poses.get(c.id) ?? at;
      return { id: c.id, offset: { x: t.e - anchor.x, y: t.f - anchor.y }, ...still };
    });
    // The hand starts at rest: a finger that has only just landed has thrown nothing.
    w.swing = { v: { x: 0, y: 0 }, at: g, ms: e.timeStamp };
    // The finger-to-origin delta rides the whole gesture, so the card does not jump under the hand.
    w.drag = {
      items,
      delta: w.opts.underFinger ? { x: 0, y: 0 } : { x: anchor.x - p.x, y: anchor.y - p.y },
      pointer: e.pointerId,
      tray: undefined,
      feel: {},
      from: g,
      atMs: e.timeStamp,
      hit,
    };
    // Dress every willing zone BEFORE the grab draws: its first frame already shows the invites.
    w.undoInvites = wearInvites(root, hit);
    // The knobs go through by NAME: what the panel says is what the clock gets.
    const { runOf: _runOf, offsetOf: _offsetOf, stillOf: _stillOf, onTap: _onTap, showsEnough: _shows, feelOf, may: _may, onRelease: _onRelease, view: _view, trayOf, onWall: _onWall, ...feel } = w.opts;
    const tray = trayOf?.(root, hit);
    const felt: Omit<CarryOptions, "anchor" | "walls" | "onWall" | "onSnap"> = { ...feel, ...(feelOf?.(root, hit) ?? {}) };
    w.drag = { ...w.drag, tray, feel: felt };
    motions.grab(items, {
      anchor,
      ...felt,
      ...(tray ? { walls: tray } : {}),
      // THE BORDER ENDS THE GESTURE, and the wiring's own bookkeeping ends with it: the finger is
      // still down, so the drag has to be forgotten here or the pointerup would drop the piece a
      // second time, from wherever the hand had wandered off to by then.
      onWall: (hit2) => {
        const taken = w.drag;
        w.drag = undefined;
        w.undoInvites?.();
        w.undoInvites = undefined;
        aim(undefined);
        if (taken && w.opts.onWall?.(hit2, taken.items)) return;
        if (taken) drop(taken.items, hit2.at);
      },
      onSnap: (_ids, at) => {
        const taken = w.drag;
        w.drag = undefined;
        w.undoInvites?.();
        w.undoInvites = undefined;
        aim(undefined);
        if (taken) drop(taken.items, at);
      },
    });
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic pointer (the checks drive one) has no capture to take
    }
  };

  /**
   * PUT THE RUN DOWN at `seat` — the one drop, whether the finger let go or the wall took the piece
   * away from it. `onReject` is the atom's whole verdict: `stay` writes the seat in as the new rest,
   * `home` leaves the tree alone and the reconcile flies the piece back. The seat is in root units,
   * as the demo desks are unposed free layouts, where parent space IS root space.
   */
  /**
   * WHAT BECOMES OF THE MAN WHO WAS ALREADY THERE — the plan says, and this is where it happens.
   *
   * The plan has carried this since the kit had places at all (`MovePlan.occupied`), and its own
   * comment calls it "opaque plan data for the RUNTIME": the seam decided it, and something has to
   * DO it. Nothing did. A board declaring that a man landing on an occupied square takes the sitter
   * got two men on one square instead, which is not a capture and not even a bug you can see until
   * the second one moves.
   *
   * `capture` sends him to the zone the plan names — a tray beside the board, a discard, a bank.
   * It is a plain re-parent, so the reconcile that follows flies him there from where he stood: the
   * animation is the tree change being told, and there is nothing else to schedule.
   *
   * AND NOT ON TOP OF THE LAST ONE. A zone that lays its own men out will lay him out; a free one
   * would leave him wherever he was standing, which is on the board he was just taken from. So a
   * free zone gets him put down IN it, beside whoever is already there.
   */
  const displace = (what: OccupiedOutcome | undefined, sitter: Node | undefined, from: Node, root: Node): void => {
    if (!what || !sitter) return;
    // A TABLE AND NOT A BRANCH. Behaviour never reads a sort (`guard.no-kind`), and the kit's answer
    // to "several things this could be" is the same everywhere: a name looked up in a registry —
    // layouts, grabs, coats, and the occupied records that produced this very outcome. So the
    // outcome NAMES what happens and this holds the doers: a new one is an entry, never a branch.
    DISPLACE[what.kind]?.(what, sitter, from, root);
  };

  /** What the runtime does about a sitter, by the name the plan gave. */
  const DISPLACE: Record<string, (what: OccupiedOutcome, sitter: Node, from: Node, root: Node) => void> = {
    capture: (what, sitter, from, root) => {
      const to = "to" in what ? byId(root, what.to) : undefined;
      if (!to) return;
      remove(from, sitter);
      const nth = to.children.length;
      add(to, sitter);
      const box = fieldsOf<BoundedFields>(to, "Bounded")?.bounds;
      const room = box ? extentOf(box) : undefined;
      if (!room) return;
      // A LOOSE ROW THAT WRAPS, in the zone's own space: enough to see them all and no more of an
      // opinion than that. Anybody may pick one up and put it down elsewhere in the zone.
      const step = Math.max(0.4, room.w / 4);
      const cols = Math.max(1, Math.floor(room.w / step));
      compose(sitter, Transformable({
        at: {
          x: -room.w / 2 + step * ((nth % cols) + 0.5),
          y: -room.h / 2 + step * (Math.floor(nth / cols) + 0.5),
        },
      }));
    },
  };
;

  /**
   * Where a container stands in ROOT units — the sum of the `at`s up its chain.
   *
   * Exact for the free layouts these desks are built from, which is the case the catalog has: a
   * layout that PLACES its children answers for them itself, and a game whose desk arranges its
   * zones would ask its own arrangement rather than this.
   */
  const worldSeat = (n: Node): Vec => {
    let x = 0;
    let y = 0;
    for (let up: Node | null = n; up; up = up.parent) {
      const at = fieldsOf<TransformableFields>(up, "Transformable")?.at;
      if (at) {
        x += at.x;
        y += at.y;
      }
    }
    return { x, y };
  };

  /** A point as the tray allows it — the same clamp the carry itself is under. */
  const inside = (tray: Walls | undefined, at: Vec): Vec =>
    tray ? { x: Math.min(tray.x1, Math.max(tray.x0, at.x)), y: Math.min(tray.y1, Math.max(tray.y0, at.y)) } : at;

  const drop = (items: readonly CarryItem[], seat: Vec): void => {
    const root = s.host.root;
    w.opts.onCarry?.({ ids: items.map((it) => it.id), at: seat, done: true, feel: w.drag?.feel ?? {} });
    if (landed(items, seat, root)) {
      // LAST, and after the tree has been written — see `onSettled`. Announced on this path too:
      // a zone taking the drop is still a drop, and a scene redrawing from the tree needs to know.
      w.opts.onSettled?.(s.host.root, items.map((it) => it.id));
      return;
    }
    for (const it of items) {
      const n = byId(root, it.id);
      if (n && onRejectOf(n) === "stay") {
        compose(n, Transformable({ at: { x: seat.x + it.offset.x, y: seat.y + it.offset.y } }));
      }
      s.motions?.release(it.id);
    }
    s.host.setRoot(root); // ONE notify: the reconcile that eases every released piece to its rest
    w.opts.onSettled?.(root, items.map((it) => it.id));
  };

  /**
   * THE DROP THAT LANDS — asked first, and it answers `true` only when a zone actually took the
   * run. Everything else falls through to the refusal above, which is the honest default: a piece
   * let go over bare desk was not accepted by anything.
   *
   * The plan is asked of the SOURCE's own rules, so what leaves is what the kit says leaves — not
   * what `runOf` drew. The two can differ, and when they do the model wins: `runOf` is a picture of
   * a run, `Grabber` is the law about one, and a wiring that overrode the law would be a game
   * inventing its own containment.
   *
   * The seat is written BEFORE the move so a free zone keeps the piece where the finger let it go —
   * `applyMove` spreads the node's own pose and rewrites only the grains the zone answered.
   */
  const landed = (items: readonly CarryItem[], seat: Vec, root: Node): boolean => {
    const lead = items[0] ? byId(root, items[0].id) : undefined;
    const source = lead?.parent ?? undefined;
    const target = lead ? w.opts.zoneAt?.(root, seat, lead) : undefined;
    if (!lead || !source || !target || target === source) return false;
    if (w.opts.onDrop?.({ lead, target, seat })) {
      for (const it of items) s.motions?.release(it.id);
      return true;
    }
    const req = { source, touched: lead, target, carried: { angle: angleOf(lead) } };
    const plan = planMove(req);
    if (plan.verdict !== "allow") return false; // refused, or waiting on a person: the piece goes home
    // WHO WAS SITTING THERE, read BEFORE the load arrives — a moment later the target holds both.
    const sitter = target.children.find((c) => !plan.load.includes(c.id));
    // THE SEAT IS IN THE TARGET'S SPACE, and this is the one line the whole re-parent turns on.
    // `seat` arrives in root units — that is where the finger was — but a pose is read against its
    // OWNER, and poses compose down the chain. Written raw into a zone standing at +1.5, a drop at
    // +1.5 puts the card at +3 and off the desk entirely.
    const home = worldSeat(target);
    for (const id of plan.load) {
      const n = byId(root, id);
      const it = items.find((i) => i.id === id);
      if (n) {
        const own = fieldsOf<TransformableFields>(n, "Transformable");
        const at = { x: seat.x + (it?.offset.x ?? 0) - home.x, y: seat.y + (it?.offset.y ?? 0) - home.y };
        compose(n, Transformable({ ...(own ?? {}), at }));
      }
    }
    applyMove(req, plan);
    displace(plan.occupied, sitter, target, root);
    for (const it of items) s.motions?.release(it.id);
    s.host.setRoot(root);
    return true;
  };

  /**
   * PUT THE AIM LIGHT ON `want` — and take it off whatever had it. Nothing to do when the answer
   * has not changed, which is most frames: this runs on every pointermove.
   */
  const aim = (want: Node | undefined): void => {
    if (want === w.keen?.zone) return;
    w.keen?.off();
    w.keen = want ? { zone: want, off: wearKeen(want) } : undefined;
    s.host.setRoot(s.host.root);
  };

  /** Who would take the run in hand, asked the way the desk wants it asked. */
  const aimed = (ids: readonly NodeId[], at: Vec): Node | undefined => {
    const root = s.host.root;
    if (w.opts.aimAt) return w.opts.aimAt(root, ids, at);
    const lead = ids[0] ? byId(root, ids[0]) : undefined;
    return lead ? w.opts.zoneAt?.(root, at, lead) : undefined;
  };

  const onMove = (e: PointerEvent): void => {
    const downs = DOWN.get(s.el);
    if (downs?.has(e.pointerId)) downs.set(e.pointerId, glassOf(view, e));
    const turn = w.turn;
    if (turn && downs) {
      const first = [...downs].find(([id]) => id !== turn.second)?.[1];
      const second = downs.get(turn.second);
      if (!first || !second) return;
      const node = byId(s.host.root, turn.id);
      if (!node) return;
      // The DELTA between the fingers, not their absolute angle — so a camera at any turn of its
      // own needs no correction at all: both readings are on the same glass, and the difference
      // between them is the same number in every frame of reference.
      compose(node, Transformable({ angle: turn.from + (lineAngle(first, second) - turn.startDeg) }));
      s.host.setRoot(s.host.root);
      return;
    }
    if (!w.drag || w.drag.pointer !== e.pointerId || !s.motions) return;
    trackSwing(w, glassOf(view, e), e.timeStamp);
    const p = toUnits(s.host, glassOf(view, e), w.opts.view?.());
    const at = { x: p.x + w.drag.delta.x, y: p.y + w.drag.delta.y };
    s.motions.dragTo(at);
    const ids = w.drag.items.map((it) => it.id);
    // INSIDE THE WALLS, exactly as the drop will be: within a tray the hand may stand a leash's
    // length past the border while the run itself is held at it, and aiming at where the FINGER is
    // would light a zone the run cannot actually reach.
    const held = inside(w.drag.tray, at);
    // THE ZONE THAT WOULD TAKE IT SAYS SO, and it says so by the same answer the release will use —
    // a light with its own idea of "near enough" promises a zone that then does not take the card,
    // and a reader believes the light over the outcome.
    aim(aimed(ids, held));
    w.opts.onCarry?.({ ids, at, done: false, feel: w.drag.feel });
  };

  const onUp = (e: PointerEvent): void => {
    DOWN.get(s.el)?.delete(e.pointerId);
    const turn = w.turn;
    const motions = s.motions;
    if (turn && motions) {
      // Either finger ending it is right: a turn is the pair, and one of them leaving is the hand
      // saying it is done.
      w.turn = undefined;
      const node = byId(s.host.root, turn.id);
      if (node) {
        // THE ATOM'S WHOLE VERDICT, in one call: keep the angle, fly home to where it began, or
        // land on the nearest step. `from` is the angle captured when the fingers arrived — read
        // back off the node it would already be the turned one, and `home` would mean `keep`.
        compose(node, Transformable({ angle: restAngle(node, angleOf(node), turn.from) }));
        motions.release(turn.id); // let go, so the trip to that angle is a settle and not a jump
        s.host.setRoot(s.host.root);
      }
      return;
    }
    const drag = w.drag;
    if (!drag || drag.pointer !== e.pointerId || !motions) return;
    w.drag = undefined;
    w.undoInvites?.();
    w.undoInvites = undefined;
    aim(undefined);
    // A TAP: the finger landed on something, stayed put and left again. It is the same gesture a
    // drag is, told apart only by how far it went and how long it stayed — so it is decided here,
    // once, and the scene is handed one answer instead of two events to compare.
    const went = Math.hypot(glassOf(view, e).x - drag.from.x, glassOf(view, e).y - drag.from.y);
    if (w.opts.onTap && went <= TAP_SLOP && e.timeStamp - drag.atMs <= TAP_MS) {
      for (const it of drag.items) motions.release(it.id);
      s.host.setRoot(s.host.root); // the reconcile eases it back to the seat it never left
      w.opts.onTap(drag.hit);
      return;
    }
    // A scene that throws on release takes the nodes here, and it is handed THE FINGER'S OWN SPEED
    // on the glass — the gesture, in the terms the gesture was made in. What the desk does with it
    // is the desk's business; what it must not have to do is reconstruct it.
    //
    // The pointerup is folded in first, so a hand that came to a stop before lifting reads as
    // stopped: holding a card still for a moment and letting go is a putting-down, and it used to
    // be a throw at whatever speed the springs still had on them.
    trackSwing(w, glassOf(view, e), e.timeStamp);
    const swing = w.swing?.v;
    w.swing = undefined;
    if (w.opts.onRelease?.(swing, drag.items)) return;
    const p = toUnits(s.host, glassOf(view, e), w.opts.view?.());
    // Nothing in these scenes accepts a drop, so every release is a refused one — see `drop`. The
    // seat is the seat the run was ALLOWED, not the point the finger was at: inside a tray a hand
    // may stand a leash's length past a wall, and letting go there must not write the piece out of
    // the box the whole gesture just refused to let it leave.
    drop(drag.items, inside(drag.tray, { x: p.x + drag.delta.x, y: p.y + drag.delta.y }));
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onUp);
  return s;
}
