// PRESSABLE — this element answers a finger, and what it WEARS while the finger is near it.
//
// The atom is the LOOK and the depth, never the meaning: what a press does is `Valued`, read by the
// consumer, exactly as a willing zone's legality is not in `Inviting`. The two atoms are siblings on
// purpose — `Inviting` dresses a zone while a drag it would take is in flight, this dresses a
// control while a pointer is over it or down on it. Both put their coat into `Coated.self`, both
// hand back an undo that restores what stood there, and neither leaves a "hovered" flag in the tree.
//
// THERE IS NO `disabled` FIELD, and there will not be one — capability is by presence, restriction
// by absence (`guard.no-negation`). A control that must not act is a control the consumer does not
// act on: the press still reports, the handler declines, and the greyed look is an ordinary coat the
// consumer writes. A flag here would be a second source of truth about the same refusal.

import { defineAtom } from "../atom.js";
import { compose, fieldsOf, type Node } from "../node.js";
import { Coated, NO_COAT, type Coat, type CoatedFields } from "./coated.js";
import { type Vec } from "../transform.js";

export interface PressableFields {
  /** Worn while a pointer is over it — the mouse's answer, and nothing a finger ever sees. */
  readonly hover: Coat;
  /** Worn while it is held down. A finger sees only this one, so it carries the whole feedback. */
  readonly held: Coat;
  /**
   * How far it sinks while held, in UNITS — written to `z`, so the cast shadow shortens by the
   * plan's own arithmetic (`base + perZ * z`) instead of by a second drawing. Negative is toward
   * the desk; zero is a control that does not move, which is a legitimate design.
   *
   * KEEP IT SMALL. `z` also SORTS the frame: a control that sinks further than the surface it sits
   * on is drawn underneath it, and a button inside a panel simply vanished while the finger was
   * down. The number here is a fraction of a control's own height for that reason, not a taste.
   */
  readonly sink: number;
  /**
   * How far the control MOVES while held, in units — down and to the right by default, which is the
   * pixel-button press every flat design has used since Windows 3: the plate descends the distance
   * its own drop shadow was holding it up by. Separate from `sink` because they say two different
   * things: `sink` is depth (the shadow shortens), this is displacement (the plate itself moves).
   * A design that wants only one of them sets the other to nothing.
   */
  readonly nudge: Vec;
}

export const Pressable = defineAtom<PressableFields>({
  name: "Pressable",
  // A footprint, because a press lands on something with a contour to hit-test and to dress.
  requires: ["Bounded"],
  // A bare `Pressable()` already answers sensibly: a faint wash under the pointer, a stronger one
  // while held, and a shallow sink. Nothing a consumer must fill in before the control feels alive.
  defaults: {
    hover: { recipe: "wash", level: 0.12, tint: "text" },
    held: { recipe: "wash", level: 0.22, tint: "shadow" },
    sink: -0.06,
    nudge: { x: 0.012, y: 0.012 },
  },
  classes: { hover: "own", held: "own", sink: "own", nudge: "own" },
});

/** What this control wears and how deep it sinks, or `undefined` when it answers no finger at all. */
export function pressableOf(n: Node): PressableFields | undefined {
  return fieldsOf<PressableFields>(n, "Pressable");
}

/**
 * Dress a control for a pointer and hand back the UNDO — the same shape as `wearInvite`, except
 * that the coat goes into `cast` rather than `self`: a control is often two nodes, and only the
 * cast reaches the face that covers the plate.
 *
 * There is no "rest" state here, and that is the whole lesson of the bug this signature replaces.
 * A `wearPress(n, "rest")` looked symmetrical and could not work: it read the coat standing on the
 * node to decide what to restore, and by then the coat standing there WAS the hover. Undressing put
 * the hover back on top of itself, so it never came off — a control that lit under the pointer and
 * stayed lit for the rest of the session. Only the caller knows what stood there before the gesture
 * began, so only the caller can put it back, and it gets a closure that does exactly that.
 */
export function wearPress(n: Node, state: "hover" | "held"): () => void {
  const fields = pressableOf(n);
  if (!fields) return () => {};
  const standing = fieldsOf<CoatedFields>(n, "Coated");
  const self = standing?.self ?? NO_COAT;
  const prevCast = standing?.cast ?? NO_COAT;
  // THE CAST, NOT `self` — and this is the difference between a control that lights and one that
  // only appears to. A stock control is TWO nodes: a plate and the face that covers almost all of
  // it. A coat on `self` dresses the plate alone, so the whole hover was a tint on a ring two
  // hundredths of a unit wide — invisible, and correctly reported as "the hover does nothing".
  // `cast` reaches the subtree, which is exactly what "this control is under the finger" means.
  compose(n, Coated({ self, cast: fields[state] }));
  return () => compose(n, Coated({ self, cast: prevCast }));
}
