// THE KNEAD — two fingers WORKING a pack, and the pack coming apart under them as they go.
//
// It is the gesture nobody has a name for and everybody has done: a hand on a deck, fingers going
// back and forth, cards moving a little on every pass. What makes it a gesture of its own rather
// than a sloppy drag is that it has NO DESTINATION. A drag ends somewhere; a swipe leaves in a
// direction; a knead ends where it began and is worth something anyway — the work is the point.
//
// SO IT IS REPORTED IN QUANTA, and that is the shape of the whole file. A gesture with an outcome
// fires once, at the end, with what happened. A gesture whose whole content is WORK has to be paid
// out as it is done, or the pack sits dead under the fingers and jumps at the end — which is the
// one thing a player kneading a deck would read as broken. Every `quantum` of ground the two
// fingers cover together is one call, and letting go is one more with `done`.
//
// TWO FINGERS, BOTH TRAVELLING — and that is what tells it apart from a deal off the same pack. A
// deal is one finger holding and one leaving; a knead is both hands' worth of finger moving and
// neither going anywhere. The roles are the arbitration, and they are readable without a timer:
// see `Swipe.anchor`, which is the same distinction seen from the other side.
//
// Event-driven, no timer (`guard.one-clock`).

import { type Node } from "../core/node.js";
import { type Point } from "../core/atoms/bounded.js";
import { type Transform, type Vec } from "../core/transform.js";
import { type Host } from "./host.js";
import { glassOf, pickTop, toUnits } from "./pointer.js";

/**
 * HOW MUCH GROUND THE TWO FINGERS TOGETHER COVER PER QUANTUM, root units.
 *
 * It is a distance and not a duration on purpose: a slow knead and a fast one should do the same
 * work per pass of the hand, not per second. Two units — about one pass of two fingers over a pack
 * — is a rate that reads as continuous without asking a shuffle to start sixty times a second.
 */
export const KNEAD_QUANTUM = 2;

/**
 * How far EACH finger has to have moved before either counts as kneading, root units.
 *
 * The whole arbitration lives on this number: under it, a finger is holding, and a hand that holds
 * with one finger and flicks with the other is dealing, not kneading. A tenth of a piece is the
 * same claim `ANCHOR_SLOP` makes in pixels, made here in the units the desk is measured in.
 */
export const KNEAD_STIR = 0.1;

export interface Knead {
  /** What is being kneaded — the node the FIRST of the two fingers landed on. */
  readonly on: Node;
  /**
   * HOW MANY QUANTA HAVE BEEN PAID OUT since the fingers landed, this one included, starting at 1.
   * A consumer that wants the work to accumulate — a pack that is more disordered the longer it is
   * kneaded — reads this and nothing else.
   */
  readonly count: number;
  /** The ground both fingers have covered together since they landed, root units. */
  readonly walked: number;
  /** Where the pair is centred right now, root units. */
  readonly at: Vec;
  /**
   * THE LAST ONE: the fingers have let go. It arrives even when the last quantum was not finished,
   * so a consumer always gets one call that says the gesture is over — the settle, the final
   * reorder, whatever the game owes the player for having stopped.
   */
  readonly done: boolean;
}

export interface KneadWiring {
  readonly host: Host;
  /** What may be kneaded. No default, for the reason a hold has none. */
  readonly want: (n: Node) => boolean;
  /** Called once per `quantum` of work, and once more when the fingers leave. */
  readonly onKnead: (k: Knead) => void;
  /** Ground per quantum, root units. Absent, `KNEAD_QUANTUM`. */
  readonly quantum?: number | undefined;
  /** How far each finger must move to be kneading rather than holding. Absent, `KNEAD_STIR`. */
  readonly stir?: number | undefined;
  /** The view the desk is drawn through, asked FRESH — a camera's `transform()`. */
  readonly view?: (() => Transform) | undefined;
  /** Where the moving pieces are drawn (`Motions.poses()`), so the finger tests what the eye sees. */
  readonly poses?: (() => ReadonlyMap<string, Transform> | undefined) | undefined;
}

interface Finger {
  /** Where it landed, in GLASS pixels — kept because that is the space a pick reads. */
  readonly downGlass: Point;
  at: Vec;
  /** How far this finger alone has travelled — the test that it is working rather than holding. */
  moved: number;
}

interface Live {
  readonly on: Node;
  walked: number;
  /** Ground covered since the last quantum was paid — never more than `quantum`, by construction. */
  owed: number;
  count: number;
  /** True once both fingers have stirred: before that the pair is a hold and a flick, not a knead. */
  working: boolean;
}

const hyp = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Wire the knead. Returns the teardown. */
export function wireKnead(w: KneadWiring): () => void {
  const view = w.host.view;
  const quantum = w.quantum ?? KNEAD_QUANTUM;
  const stir = w.stir ?? KNEAD_STIR;

  /** The fingers down, in arrival order — the first one names what is being kneaded. */
  const fingers = new Map<number, Finger>();
  let live: Live | undefined;

  const unitsOf = (g: Point): Vec => toUnits(w.host, g, w.view?.());
  const centre = (): Vec => {
    let x = 0;
    let y = 0;
    for (const f of fingers.values()) {
      x += f.at.x;
      y += f.at.y;
    }
    const n = fingers.size || 1;
    return { x: x / n, y: y / n };
  };

  const onDown = (e: PointerEvent): void => {
    const g = glassOf(view, e);
    fingers.set(e.pointerId, { downGlass: g, at: unitsOf(g), moved: 0 });
    if (fingers.size !== 2 || live) return;
    // THE FIRST FINGER NAMES THE SUBJECT, not the second: the hand came to rest on the pack and
    // then brought its neighbour, and picking whichever arrived last would make the same gesture
    // mean two different things depending on which finger the browser reported first. It is picked
    // where that finger LANDED, in the glass the pick already speaks.
    const first = [...fingers.values()][0]!;
    const on = pickTop(w.host, first.downGlass, w.want, w.view?.(), w.poses?.());
    if (on) live = { on, walked: 0, owed: 0, count: 0, working: false };
  };

  const onMove = (e: PointerEvent): void => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const at = unitsOf(glassOf(view, e));
    const step = hyp(f.at, at);
    f.at = at;
    f.moved += step;
    if (!live || fingers.size !== 2) return;
    // THE GROUND IS COUNTED FROM THE FIRST FRAME, and only the PAYING OUT waits. The two fingers
    // cannot both have stirred until the second one moves, so a gesture judged from the moment it
    // qualified would throw away everything the first finger had already done — which on a slow
    // knead is most of the first pass.
    live.walked += step;
    live.owed += step;
    // BOTH, OR NEITHER. One finger doing all the work is a hold and a flick, and paying that out as
    // kneading is how a deal off a held pack turns into a shuffle nobody asked for.
    if (!live.working) {
      if (![...fingers.values()].every((g) => g.moved >= stir)) return;
      live.working = true;
    }
    while (live.owed >= quantum) {
      live.owed -= quantum;
      live.count += 1;
      w.onKnead({ on: live.on, count: live.count, walked: live.walked, at: centre(), done: false });
    }
  };

  const end = (e: PointerEvent): void => {
    if (!fingers.delete(e.pointerId)) return;
    if (!live || fingers.size >= 2) return;
    const was = live;
    const at = centre();
    live = undefined;
    // ONE LAST CALL, ALWAYS — even for a knead that never earned a quantum. A consumer owes the
    // player something for having stopped, and it must not have to guess when that moment was.
    if (was.working) w.onKnead({ on: was.on, count: was.count, walked: was.walked, at, done: true });
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", end);

  return () => {
    fingers.clear();
    live = undefined;
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", end);
    view.removeEventListener("pointercancel", end);
  };
}
