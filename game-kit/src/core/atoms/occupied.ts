// OCCUPIED — what becomes of the one ALREADY in the slot when a drop lands on it.
//
// `capture{to}` · `merge` · `swap` · `reject`. This is NOT the job of `AcceptRule`: the rule answers
// "may THIS one enter" and is silent about the sitter. Mixing the two was a client2 smell — the rule
// that lets a piece in should not also decide the fate of the piece it lands on.
//
// The outcome is DATA describing what moves, so it travels the wire and a test reads it without a
// renderer. See docs/design/container.md.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";

export type OccupiedOutcome =
  /** The drop is refused; nobody moves. */
  | { readonly kind: "reject" }
  /** Incomer takes the slot, the sitter goes back where the incomer came from. */
  | { readonly kind: "swap" }
  /** Both stay — the slot holds more than one now (a pile grows, a meld forms). */
  | { readonly kind: "merge" }
  /** The sitter is taken away to zone `to`, the incomer takes the slot. */
  | { readonly kind: "capture"; readonly to: string };

/** A named record that answers with one outcome. Parameterised ones (capture) bake their argument. */
export interface OccupiedRecord {
  resolve(): OccupiedOutcome;
}

export const reject: OccupiedRecord = { resolve: () => ({ kind: "reject" }) };
export const swap: OccupiedRecord = { resolve: () => ({ kind: "swap" }) };
export const merge: OccupiedRecord = { resolve: () => ({ kind: "merge" }) };
/** The sitter is captured to zone `to` — e.g. a taken chess piece to its owner's tray. */
export function capture(to: string): OccupiedRecord {
  return { resolve: () => ({ kind: "capture", to }) };
}

const OCCUPIED = new Map<string, OccupiedRecord>();

export function registerOccupied(name: string, record: OccupiedRecord): void {
  OCCUPIED.set(name, record);
}
export function occupiedRecord(name: string): OccupiedRecord | undefined {
  return OCCUPIED.get(name);
}
/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetOccupied(): void {
  OCCUPIED.clear();
}
/** Register the parameterless three under their names; `capture` is named by the consumer with its `to`. */
export function installStockOccupied(): void {
  registerOccupied("reject", reject);
  registerOccupied("swap", swap);
  registerOccupied("merge", merge);
}

export interface DisplacerFields {
  /** A registry reference: what happens to the sitter when a drop lands on this occupied slot. */
  readonly occupied: string;
}

export const Displacer = defineAtom<DisplacerFields>({
  name: "Displacer",
  requires: ["Container"],
  defaults: { occupied: "reject" }, // the safe default: an occupied slot refuses rather than clobbers
  classes: { occupied: "own" },
});

/**
 * What happens to the sitter when a drop lands on this container's occupied slot. `reject` when the
 * container is not a `Displacer` or the policy is unregistered — the conservative answer: do not clobber.
 */
export function resolveOccupied(container: Node): OccupiedOutcome {
  const fields = fieldsOf<DisplacerFields>(container, "Displacer");
  if (!fields) return { kind: "reject" };
  const record = occupiedRecord(fields.occupied);
  return record ? record.resolve() : { kind: "reject" };
}
