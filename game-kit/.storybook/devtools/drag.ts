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
  type Vec,
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
};

/** The run a card leads in a column: itself and every draggable sibling after it in tree order. */
export function runBelow(_root: Node, hit: Node): readonly Node[] {
  const siblings = hit.parent?.children ?? [hit];
  return siblings.slice(siblings.indexOf(hit)).filter(draggable);
}

interface Wiring {
  opts: DragOptions;
  drag: { readonly items: readonly CarryItem[]; readonly delta: Point } | undefined;
  /** Undresses every zone the grab invited — release calls it, and it is the whole protocol. */
  undoInvites: (() => void) | undefined;
}

const WIRED = new WeakMap<HTMLElement, Wiring>();

/** Attach the demo drag to an `animate` scene (idempotent), and hand the scene back. */
export function wireDrag(s: Scene, opts: DragOptions = {}): Scene {
  const standing = WIRED.get(s.el);
  if (standing) {
    standing.opts = opts; // the same canvas, new knobs — never a second set of listeners
    return s;
  }
  const w: Wiring = { opts, drag: undefined, undoInvites: undefined };
  WIRED.set(s.el, w);
  const view = s.host.view;

  const onDown = (e: PointerEvent): void => {
    const motions = s.motions;
    if (!motions || w.drag) return;
    const root = s.host.root;
    const g = glassOf(view, e);
    // Only a draggable lifts — and only one the gate lets through: the pick reads the SAME plan
    // the painter drew, so what refuses the finger is exactly what the eye sees refuse it.
    const hit = pick(s.host, root, g, (n) => draggable(n) && (w.opts.may?.(n) ?? true));
    if (!hit) return;
    const run = w.opts.runOf ? w.opts.runOf(root, hit) : [hit];
    const poses = transformsOf(root);
    const at = poses.get(hit.id);
    if (!at || run.length === 0) return;
    const anchor = { x: at.e, y: at.f };
    const p = toUnits(s.host, g);
    const items = run.map((c) => {
      const t = poses.get(c.id) ?? at;
      return { id: c.id, offset: { x: t.e - anchor.x, y: t.f - anchor.y } };
    });
    // The finger-to-origin delta rides the whole gesture, so the card does not jump under the hand.
    w.drag = { items, delta: { x: anchor.x - p.x, y: anchor.y - p.y } };
    // Dress every willing zone BEFORE the grab draws: its first frame already shows the invites.
    w.undoInvites = wearInvites(root, hit);
    // The knobs go through by NAME: what the panel says is what the clock gets.
    const { runOf: _runOf, may: _may, onRelease: _onRelease, ...feel } = w.opts;
    motions.grab(items, { anchor, ...feel });
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic pointer (the checks drive one) has no capture to take
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (!w.drag || !s.motions) return;
    const p = toUnits(s.host, glassOf(view, e));
    s.motions.dragTo({ x: p.x + w.drag.delta.x, y: p.y + w.drag.delta.y });
  };

  const onUp = (e: PointerEvent): void => {
    const drag = w.drag;
    const motions = s.motions;
    if (!drag || !motions) return;
    w.drag = undefined;
    w.undoInvites?.();
    w.undoInvites = undefined;
    const root = s.host.root;
    // A scene that throws on release takes the nodes here — the finger's speed is still on the
    // springs, read before anything is released.
    if (w.opts.onRelease?.(motions.velocity(), drag.items)) return;
    const p = toUnits(s.host, glassOf(view, e));
    const seat = { x: p.x + drag.delta.x, y: p.y + drag.delta.y };
    for (const it of drag.items) {
      const n = byId(root, it.id);
      // Nothing in these scenes accepts a drop, so EVERY release is a refused one, and the
      // atom's own field is the whole verdict: `home` leaves the tree alone and the next
      // reconcile flies the card back; `stay` writes the release seat in as the new rest. The
      // seat is written in root units — the demo desks are unposed free layouts, where parent
      // space IS root space.
      if (n && onRejectOf(n) === "stay") {
        compose(n, Transformable({ at: { x: seat.x + it.offset.x, y: seat.y + it.offset.y } }));
      }
      motions.release(it.id);
    }
    s.host.setRoot(root); // ONE notify: the reconcile that eases every released card to its rest
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onUp);
  return s;
}
