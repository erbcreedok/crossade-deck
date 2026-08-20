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
  byId,
  compose,
  draggable,
  fieldsOf,
  restAngle,
  rotatable,
  glassOf,
  onRejectOf,
  pick,
  toUnits,
  transformsOf,
  Transformable,
  wearInvites,
  type CarryItem,
  type CarryTuning,
  type Node,
  type Point,
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
  drag: { readonly items: readonly CarryItem[]; readonly delta: Point; readonly pointer: number; readonly tray: Walls | undefined } | undefined;
  /** Undresses every zone the grab invited — release calls it, and it is the whole protocol. */
  undoInvites: (() => void) | undefined;
}

const WIRED = new WeakMap<HTMLElement, Wiring>();

/** Every pointer currently down on the view, so the second one can be measured against the first. */
const DOWN = new WeakMap<HTMLElement, Map<number, Point>>();

/** The angle of the line between two glass points, in degrees clockwise — the screen's convention. */
const lineAngle = (a: Point, b: Point): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** A node's own angle right now, which is where a released turn may be sent back to. */
const angleOf = (n: Node): number => fieldsOf<TransformableFields>(n, "Transformable")?.angle ?? 0;

/** Attach the demo drag to an `animate` scene (idempotent), and hand the scene back. */
export function wireDrag(s: Scene, opts: DragOptions = {}): Scene {
  const standing = WIRED.get(s.el);
  if (standing) {
    standing.opts = opts; // the same canvas, new knobs — never a second set of listeners
    return s;
  }
  const w: Wiring = { opts, drag: undefined, turn: undefined, undoInvites: undefined };
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
    const hit = pick(s.host, root, g, (n) => draggable(n) && (w.opts.may?.(n) ?? true), w.opts.view?.(), s.motions?.poses());
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
    const items = run.map((c) => {
      const t = poses.get(c.id) ?? at;
      return { id: c.id, offset: { x: t.e - anchor.x, y: t.f - anchor.y } };
    });
    // The finger-to-origin delta rides the whole gesture, so the card does not jump under the hand.
    w.drag = { items, delta: { x: anchor.x - p.x, y: anchor.y - p.y }, pointer: e.pointerId, tray: undefined };
    // Dress every willing zone BEFORE the grab draws: its first frame already shows the invites.
    w.undoInvites = wearInvites(root, hit);
    // The knobs go through by NAME: what the panel says is what the clock gets.
    const { runOf: _runOf, may: _may, onRelease: _onRelease, view: _view, trayOf, onWall: _onWall, ...feel } = w.opts;
    const tray = trayOf?.(root, hit);
    w.drag = { ...w.drag, tray };
    motions.grab(items, {
      anchor,
      ...feel,
      ...(tray ? { walls: tray } : {}),
      // THE BORDER ENDS THE GESTURE, and the wiring's own bookkeeping ends with it: the finger is
      // still down, so the drag has to be forgotten here or the pointerup would drop the piece a
      // second time, from wherever the hand had wandered off to by then.
      onWall: (hit2) => {
        const taken = w.drag;
        w.drag = undefined;
        w.undoInvites?.();
        w.undoInvites = undefined;
        if (taken && w.opts.onWall?.(hit2, taken.items)) return;
        if (taken) drop(taken.items, hit2.at);
      },
      onSnap: (_ids, at) => {
        const taken = w.drag;
        w.drag = undefined;
        w.undoInvites?.();
        w.undoInvites = undefined;
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
  /** A point as the tray allows it — the same clamp the carry itself is under. */
  const inside = (tray: Walls | undefined, at: Vec): Vec =>
    tray ? { x: Math.min(tray.x1, Math.max(tray.x0, at.x)), y: Math.min(tray.y1, Math.max(tray.y0, at.y)) } : at;

  const drop = (items: readonly CarryItem[], seat: Vec): void => {
    const root = s.host.root;
    for (const it of items) {
      const n = byId(root, it.id);
      if (n && onRejectOf(n) === "stay") {
        compose(n, Transformable({ at: { x: seat.x + it.offset.x, y: seat.y + it.offset.y } }));
      }
      s.motions?.release(it.id);
    }
    s.host.setRoot(root); // ONE notify: the reconcile that eases every released piece to its rest
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
    const p = toUnits(s.host, glassOf(view, e), w.opts.view?.());
    s.motions.dragTo({ x: p.x + w.drag.delta.x, y: p.y + w.drag.delta.y });
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
    // A scene that throws on release takes the nodes here — the finger's speed is still on the
    // springs, read before anything is released.
    if (w.opts.onRelease?.(motions.velocity(), drag.items)) return;
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
