// ACTIONABLE — this element EMITS AN INTENT when it is activated. It is the atom a control
// carries: a button, a menu item, a toggle's tap target.
//
// The intent is a NAME, never a callback. A node travels — into a snapshot, over a wire, into a
// second screen's projection — and a function does not survive any of those trips. So the field is
// a registry ref (`docs/design/hud.md`): the control says WHICH verb it means, and what that verb
// does is the registry's business, or the consumer's. The kit knows nothing about a move and must
// not: `activate` hands back the name and stops there.
//
// Where the menu's CONTENT comes from is a different question, already answered by `core/actions.ts`
// — `actionsOf(node)` derives it from the capabilities the node carries, so a card never advertises
// a flip it cannot perform. This atom is the other half: the item that carries one of those names.
//
// THERE IS NO `disabled`, and that is a law, not an omission (`guard.no-negation` scans for it).
// A control that cannot be pressed is a control that does not carry this atom — or carries it
// without the `Bounded` its requirement chain needs, which comes to the same refusal. Greyness is
// a CONSEQUENCE a consumer draws from the refusal, never a field that could disagree with it.

import { defineAtom } from "../atom.js";
import { caps, fieldsOf, type Node } from "../node.js";

export interface ActionableFields {
  /** The registry ref this control means — a name in the action registry, not a verb to run. */
  readonly action: string;
}

export const Actionable = defineAtom<ActionableFields>({
  name: "Actionable",
  // A footprint, because activation arrives by a pointer landing on a contour — the same reason
  // `Pressable` and `Focusable` ask for one.
  requires: ["Bounded"],
  // Empty is honest: a control with no intent yet is a control that emits nothing, and that reads
  // the same as `activate` refusing. There is no second state to invent.
  defaults: { action: "" },
  classes: { action: "own" },
});

/** Can this node be activated at all? The requirement chain answers, so a footprint-less control refuses. */
export function actionable(n: Node): boolean {
  return caps(n).has("Actionable");
}

/**
 * The ref this control names, `""` when it names none. Reading is capability-gated like every
 * other field in the kit (`fieldsOf` asks `caps` first), so an atom whose requirements are not met
 * reads as absent rather than as a field with the capability switched off. There is no half-state
 * to handle, here or anywhere else.
 */
export function intentOf(n: Node): string {
  return fieldsOf<ActionableFields>(n, "Actionable")?.action ?? "";
}

/**
 * The intent this control EMITS, or `undefined` when it emits none. That `undefined` is the whole
 * of "disabled": no atom, an unsatisfied requirement, or a declared-but-empty ref all come back the
 * same way, so a caller never has to ask which kind of no it got.
 *
 * A name nobody registered still comes back. The control does not police the registry — consumers
 * register their own verbs, and the kit ships only the handful its built-in atoms imply.
 */
export function activate(n: Node): string | undefined {
  if (!actionable(n)) return undefined;
  const intent = intentOf(n);
  return intent === "" ? undefined : intent;
}
