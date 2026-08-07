// RESOLVE — where a node gets what it did not author.
//
// Inherited and summed values are NOT stored on the node and never travel the wire: they
// come from a context that walks down the tree, and they are read AT APPLY TIME. Freezing
// a resolved base when an animation starts is exactly how the fan z-order broke three times
// in client1 — the fan could collapse mid-flight while the animation still used the old base.
//
// There is no `parent.*` namespace in the model. An owner's fields are ordinary fields of
// another node, read through the chain.

import { chainOf, fieldsOf, type Node } from "./node.js";
import { DEFAULT_VIEWER, type ViewerSettings } from "./viewer.js";

/**
 * Four classes, and there is no fifth. A field that declares none fails the guard.
 *  - own       — never inherited; no value means no field.
 *  - fromOwner — not set here → the nearest set value up the chain. Override = set it.
 *  - addsUp    — the sum along the chain. It cannot be cancelled, only added to.
 *  - rootOnly  — the field does not exist on a child; asking is meaningless.
 */
export type InheritClass = "own" | "fromOwner" | "addsUp" | "rootOnly";

export interface ResolveContext {
  /** The HUD etalon in screen pixels. The HOST computes it, or the viewer overrides it. */
  readonly unit: number;
  /** Owners from the root down to the node, inclusive. */
  readonly chain: readonly Node[];
  /**
   * The viewer plane, cascaded. It is here so a node never has to be ASKED about the
   * onlooker — and it must never travel: two viewers hold different values over one truth.
   */
  readonly viewer: ViewerSettings;
}

export function contextFor(n: Node, unit: number, viewer: ViewerSettings = DEFAULT_VIEWER): ResolveContext {
  return { unit, chain: chainOf(n), viewer };
}

/** Sum of one numeric field along the whole chain — the `addsUp` class. */
export function sumAlongChain(ctx: ResolveContext, atom: string, field: string): number {
  let total = 0;
  for (const owner of ctx.chain) {
    const f = fieldsOf<Record<string, unknown>>(owner, atom);
    const v = f?.[field];
    if (typeof v === "number") total += v;
  }
  return total;
}

/** Nearest set value from the node upwards — the `fromOwner` class. */
export function nearestAlongChain<T>(ctx: ResolveContext, atom: string, field: string): T | undefined {
  for (let i = ctx.chain.length - 1; i >= 0; i -= 1) {
    const f = fieldsOf<Record<string, unknown>>(ctx.chain[i]!, atom);
    const v = f?.[field];
    if (v !== undefined) return v as T;
  }
  return undefined;
}

/** Own value only — the `own` class. Present for symmetry, so no call site improvises. */
export function ownValue<T>(n: Node, atom: string, field: string): T | undefined {
  return fieldsOf<Record<string, unknown>>(n, atom)?.[field] as T | undefined;
}
