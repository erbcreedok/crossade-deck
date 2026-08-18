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
    sink: -0.6,
    nudge: { x: 0.04, y: 0.04 },
  },
  classes: { hover: "own", held: "own", sink: "own", nudge: "own" },
});

/** What this control wears and how deep it sinks, or `undefined` when it answers no finger at all. */
export function pressableOf(n: Node): PressableFields | undefined {
  return fieldsOf<PressableFields>(n, "Pressable");
}

/**
 * Dress a control in one of its states and hand back the undo — the same shape as `wearInvite`.
 *
 * `state` is which of the atom's coats to put on; `"rest"` wears nothing. The undo restores what was
 * standing there, so a control that already wore its own coat (a toggle that is on, a tile mid-load)
 * keeps it when the pointer leaves.
 */
export function wearPress(n: Node, state: "hover" | "held" | "rest"): () => void {
  const fields = pressableOf(n);
  if (!fields) return () => {};
  const standing = fieldsOf<CoatedFields>(n, "Coated");
  const prevSelf = standing?.self ?? NO_COAT;
  const cast = standing?.cast ?? NO_COAT;
  const wanted = state === "rest" ? prevSelf : fields[state];
  compose(n, Coated({ self: wanted, cast }));
  return () => compose(n, Coated({ self: prevSelf, cast }));
}
