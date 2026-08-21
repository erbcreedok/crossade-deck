// THE LONG PRESS — a finger that stays put long enough to mean something other than a tap.
//
// It is a SEPARATE seam from `wireButtons`, and not for tidiness. A press is what a CONTROL answers,
// so that wiring only ever looks at nodes carrying `Pressable`. A long press is aimed at the thing
// on the desk — a card, a token, a zone — and none of those are controls. One wiring asking both
// questions would have to pick a capability to filter by, and there is no single right answer: the
// consumer says what a hold may land on, because only the consumer knows what its game holds.
//
// What the hold MEANS is likewise not decided here. The kit reports "a finger rested on this node";
// opening a context menu, picking up a stack, or showing a card larger are all a consumer's answer
// to that, and each of them keeps its own state.

import { type Node } from "../core/node.js";
import { type Transform } from "../core/transform.js";
import { type Host } from "./host.js";
import { type Point } from "../core/atoms/bounded.js";
import { glassOf, pickTop } from "./pointer.js";

/**
 * How long a finger has to rest, in milliseconds.
 *
 * 500 is the platform's own answer — it is what iOS and Android use before a long-press menu — and
 * matching it is the point: a player's thumb already knows this duration from every other app on
 * the phone, and a kit that picked its own number would feel broken rather than different.
 */
export const HOLD_MS = 500;

/**
 * How far the finger may wander and still be resting, in GLASS pixels.
 *
 * Pixels rather than units, because a slip is a property of the HAND, not of the desk: zooming out
 * must not make a steady thumb count as a drag. The same reasoning, and the same number, as the
 * press wiring's own slop.
 */
const SLOP = 5;

export interface HoldWiring {
  readonly host: Host;
  /**
   * What a hold may land on. There is no default: a game that holds cards and a game that holds
   * zones want different answers, and a kit that guessed would be wrong in one of them.
   */
  readonly want: (n: Node) => boolean;
  /** Called ONCE per gesture, when the finger has rested on a node long enough. */
  readonly onHold: (node: Node, at: Point) => void;
  /** How long the rest must last. Absent, `HOLD_MS`. */
  readonly after?: number;
  /** The view the desk is drawn through, asked FRESH — a camera's `transform()`. */
  readonly view?: (() => Transform) | undefined;
}

/**
 * Wire the long press. Returns the teardown.
 *
 * Nothing is registered per node: the tree is asked WHO IS UNDER THE FINGER at the moment there is
 * one, through the same `pickTop` the press wiring and the painter use — so HUD beats desk here too,
 * and a node added or removed mid-game needs no re-wiring.
 */
export function wireHold(w: HoldWiring): () => void {
  const view = w.host.view;
  const after = w.after ?? HOLD_MS;

  /** The gesture in flight: where it landed, on what, and the timer that will call it a hold. */
  let resting: { on: Node; at: Point; timer: ReturnType<typeof setTimeout> } | undefined;

  const cancel = (): void => {
    if (!resting) return;
    clearTimeout(resting.timer);
    resting = undefined;
  };

  const onDown = (e: PointerEvent): void => {
    cancel();
    const at = glassOf(view, e);
    const on = pickTop(w.host, at, w.want, w.view?.());
    if (!on) return;
    resting = {
      on,
      at,
      // FIRED ONCE AND THEN FORGOTTEN. Clearing `resting` inside the timer is what makes a hold a
      // single event: without it a release after the hold would look like a gesture still in
      // flight, and the next `pointerdown` would cancel a timer that had already run.
      timer: setTimeout(() => {
        const held = resting;
        resting = undefined;
        if (held) w.onHold(held.on, held.at);
      }, after),
    };
  };

  const onMove = (e: PointerEvent): void => {
    if (!resting) return;
    // A FINGER THAT TRAVELLED WAS GOING SOMEWHERE. A drag that also fired a hold would open a menu
    // in the middle of carrying a card, which is the one thing a player never means.
    const g = glassOf(view, e);
    if (Math.hypot(g.x - resting.at.x, g.y - resting.at.y) > SLOP) cancel();
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", cancel);
  view.addEventListener("pointercancel", cancel);
  view.addEventListener("pointerleave", cancel);

  return () => {
    cancel();
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", cancel);
    view.removeEventListener("pointercancel", cancel);
    view.removeEventListener("pointerleave", cancel);
  };
}
