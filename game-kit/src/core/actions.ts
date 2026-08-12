// ACTIONS — the "what can I do with this?" set, the context menu of a node. It is NOT declared on
// the node: it EMERGES from what the node already IS. A node with `Flippable` can be flipped, one
// with `Tiltable` can be tapped — the verb follows the capability, so the two never fall out of sync
// and a card cannot advertise a flip it cannot perform.
//
// An action is a REGISTRY record, like a layout or an arrowhead: a name, a human verb, and the one
// capability it needs. `actionsOf(node)` is then a filter — every action whose capability the node
// carries, in registration order. Consumers register their own verbs; the kit ships the handful the
// built-in atoms imply. See CANONS.md §3 and NIGHT-DECISIONS.md.

import { caps, fieldsOf, type Node } from "./node.js";
import { Flippable, type FlippableFields } from "./atoms/flippable.js";

export interface ActionRecord {
  /** The human-facing verb, already written (the kit carries no words a player reads). */
  readonly label: string;
  /** The capability (atom name) a node must carry for this action to be offered. */
  readonly requires: string;
  /**
   * What the verb DOES — the node it becomes. Absent means a pure query (the menu offers it, the
   * orchestrator wires the effect). Present means the kit ships the change itself: `flip` returns the
   * node with `turns` bumped, and the new side is still the parity, resolved at paint time.
   */
  readonly perform?: (n: Node) => Node;
}

/** A resolved action on a node: its registry name plus the record it points at. */
export interface Action extends ActionRecord {
  readonly name: string;
}

const ACTIONS = new Map<string, ActionRecord>();

export function registerAction(name: string, record: ActionRecord): void {
  ACTIONS.set(name, record);
}
export function actionRecord(name: string): ActionRecord | undefined {
  return ACTIONS.get(name);
}
/** All registered action names, in registration order. */
export function actionNames(): readonly string[] {
  return [...ACTIONS.keys()];
}
/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetActions(): void {
  ACTIONS.clear();
}
/** The verbs the built-in atoms imply. Called by the consumer, not on import. */
export function installStockActions(): void {
  registerAction("flip", { label: "Flip", requires: "Flippable", perform: bumpTurns });
  registerAction("tap", { label: "Tap", requires: "Tiltable" });
  registerAction("drag", { label: "Drag", requires: "Draggable" });
  registerAction("focus", { label: "Focus", requires: "Focusable" });
}

/**
 * The flip verb, and the whole of it: `turns` plus one on the node, every other field untouched
 * (§5 — "the flip action tumbles turns and nothing else"). A node without `Flippable` is returned
 * as it came, so the verb is a no-op on a node that never carried it.
 */
function bumpTurns(n: Node): Node {
  const f = fieldsOf<FlippableFields>(n, "Flippable");
  if (!f) return n;
  const next: Node = { id: n.id, parent: n.parent, children: n.children, atoms: new Map(n.atoms) };
  next.atoms.set("Flippable", Flippable({ ...f, turns: f.turns + 1 }));
  return next;
}

/**
 * Run a verb on a node and return what it becomes. An action with no `perform` (a pure query the
 * orchestrator wires) leaves the node unchanged, as does a name nobody registered — the caller can
 * always set the result as the new root without checking which case it hit.
 */
export function perform(name: string, node: Node): Node {
  return ACTIONS.get(name)?.perform?.(node) ?? node;
}

/**
 * The actions a node offers: every registered action whose required capability it carries, in
 * registration order. A node with no matching capability offers nothing — the empty menu is a
 * node you can only look at.
 */
export function actionsOf(node: Node): readonly Action[] {
  const has = caps(node);
  const out: Action[] = [];
  for (const [name, record] of ACTIONS) {
    if (has.has(record.requires)) out.push({ name, ...record });
  }
  return out;
}
