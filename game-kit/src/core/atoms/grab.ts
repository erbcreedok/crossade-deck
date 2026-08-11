// GRAB — one question: what leaves from under the finger when a CHILD of this container is touched.
//
// `one` · `top` · `above`. There is no separate `split`: "tear off a sub-pile" and "lift the tokens
// resting on top" are the SAME taking; the difference lives in how the load flies (the source's own
// layout) and in what the target does with it (the target's accept/occupied), not in the grab.
//
// A container with no grab policy eats no gesture — the hit-test walks up to an owner that does. An
// EMPTY pile grabs an empty load, so the drag never starts (the empty box travels as itself, if it
// is draggable, not as its absent top card). See docs/design/container.md.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node, type NodeId } from "../node.js";

/** Given the children in tree order and the touched one, the load that leaves — a list, always. */
export type GrabRule = (children: readonly NodeId[], touched: NodeId) => readonly NodeId[];

/** Just the touched child. The slot stays; only its content goes. */
export const grabOne: GrabRule = (_children, touched) => [touched];

/** The top of the pile — the LAST child — whatever was touched. An empty pile grabs nothing. */
export const grabTop: GrabRule = (children) => (children.length ? [children[children.length - 1]!] : []);

/** The touched child and everything ABOVE it (after it in tree order) — a sub-pile torn off. */
export const grabAbove: GrabRule = (children, touched) => {
  const i = children.indexOf(touched);
  return i < 0 ? [] : children.slice(i);
};

const GRABS = new Map<string, GrabRule>();

export function registerGrab(name: string, rule: GrabRule): void {
  GRABS.set(name, rule);
}
export function grabRule(name: string): GrabRule | undefined {
  return GRABS.get(name);
}
/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetGrabs(): void {
  GRABS.clear();
}
/** Register the three under the names the design uses. Called by the consumer, not on import. */
export function installStockGrabs(): void {
  registerGrab("one", grabOne);
  registerGrab("top", grabTop);
  registerGrab("above", grabAbove);
}

export interface GrabberFields {
  /** A registry reference: which children leave when one is touched. `one` when unsaid. */
  readonly grab: string;
}

export const Grabber = defineAtom<GrabberFields>({
  name: "Grabber",
  requires: ["Container"],
  defaults: { grab: "one" }, // a grabbable container defaults to lifting just the touched child
  classes: { grab: "own" },
});

/**
 * The load that leaves this container when `touched` is grabbed, by id. Empty when the container is
 * not a `Grabber` (nothing to take, the gesture is not eaten) or the policy name is unregistered.
 */
export function grabFrom(container: Node, touched: NodeId): readonly NodeId[] {
  const fields = fieldsOf<GrabberFields>(container, "Grabber");
  if (!fields) return [];
  const rule = grabRule(fields.grab);
  if (!rule) return [];
  return rule(container.children.map((c) => c.id), touched);
}
