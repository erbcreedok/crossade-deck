// THE FLIPS REGISTRY — what `Flippable.flip` names, and the one effect that turns a node over.
//
// A flip is two things at once, and the atom holds neither: the GEOMETRY (a reflection the children
// inherit) and the CONTENT (what the node BECOMES on its back — another surface, or a whole other
// subtree). Both live in a recipe here, the mirror of `surfaces`/`coats`: `core` names the recipe,
// `render` knows what it does. The engine mixes it in through the effects list and knows no recipe
// by name.
//
// The two are driven by DIFFERENT parities, and that is what makes a re-flipped card in a flipped
// stack come out right on its own (case A in the handoff):
//   - REFLECTION follows a node's OWN `turns`. Children inherit it through the transform chain, so a
//     stack's reflection and a card's reflection COMPOSE — flip the stack and the card once each and
//     the two cancel, and the card is upright again.
//   - CONTENT follows the SUMMED `turns` up the chain. The stack turned once shows every child's
//     back; the child turned back sums to even and shows its front — no per-id bookkeeping anywhere.

import { fieldsOf, type Node } from "../core/node.js";
import { type FlippableFields } from "../core/atoms/flippable.js";
import { Surfaced, type SurfacedFields } from "../core/atoms/surfaced.js";
import { sumAlongChain } from "../core/resolve.js";
import { IDENTITY, reflect } from "../core/transform.js";
import { registerEffect, type Effect } from "./effects.js";

/**
 * A flip recipe. `reflects` says whether the turn mirrors the geometry — a card and a knight do, a
 * row that reshuffles its content does not. `turn` is what the node BECOMES face-down, `back` the way
 * home; for a pure mirror both are the identity, and the geometry does all the work.
 */
export interface Flip {
  readonly reflects: boolean;
  readonly turn: (n: Node) => Node;
  readonly back: (n: Node) => Node;
}

const FLIPS = new Map<string, Flip>();

export function registerFlip(name: string, flip: Flip): void {
  FLIPS.set(name, flip);
}

/** `undefined` for a name nobody registered — the effect leaves the node unturned, as with a surface. */
export function flipRecord(name: string): Flip | undefined {
  return FLIPS.get(name);
}

export function flipNames(): readonly string[] {
  return [...FLIPS.keys()];
}

/**
 * The node wearing its back surface. A shallow clone — same id, same children, same other atoms —
 * with only `Surfaced` replaced by the `back` the atom holds. Empty `back`, or no face at all, and
 * there is nothing to swap to, so the node is returned unchanged and the turn shows the front.
 */
function shownBack(n: Node): Node {
  const surf = fieldsOf<SurfacedFields>(n, "Surfaced");
  const flip = fieldsOf<FlippableFields>(n, "Flippable");
  if (!surf || !flip || !flip.back) return n;
  const swapped: Node = { id: n.id, parent: n.parent, children: n.children, atoms: new Map(n.atoms) };
  swapped.atoms.set("Surfaced", Surfaced({ surface: flip.back }));
  return swapped;
}

let effectInstalled = false;

/**
 * The stock recipes and the effect that runs them — installed by the consumer, like every other
 * `installStock*`. Idempotent: the recipes are a map and the effect registers once.
 */
export function installStockFlips(): void {
  // MIRROR — the default: pure geometry, nothing swapped. A knight faces the other way, a mirrored
  // desk turns its children over; the angle is the node's own `axis`, so one recipe is every mirror.
  registerFlip("mirror", { reflects: true, turn: (n) => n, back: (n) => n });
  // TURN OVER — a card: the reflection AND the other face. `turn` shows the back surface, `back` the
  // same (a turn is its own inverse), and an empty `back` falls through to the front.
  registerFlip("turnOver", { reflects: true, turn: shownBack, back: shownBack });

  if (!effectInstalled) {
    registerEffect(flipEffect);
    effectInstalled = true;
  }
}

/** Test seam — the registry is process-wide and the effect flag rides with it. */
export function resetFlips(): void {
  FLIPS.clear();
  effectInstalled = false;
}

/**
 * THE FLIP EFFECT — one function in the engine's list. Reflection on the node's OWN odd parity;
 * content-swap on the SUMMED odd parity. A node with no `Flippable`, or a dangling recipe name, is
 * left exactly as it was.
 */
export const flipEffect: Effect = (n, ctx) => {
  const own = fieldsOf<FlippableFields>(n, "Flippable");
  if (!own) return { node: n, pre: IDENTITY };
  const rec = flipRecord(own.flip || "mirror");
  if (!rec) return { node: n, pre: IDENTITY };
  const summedOdd = mod2(sumAlongChain(ctx, "Flippable", "turns")) === 1;
  const ownOdd = mod2(own.turns) === 1;
  return {
    node: summedOdd ? rec.turn(n) : n,
    pre: ownOdd && rec.reflects ? reflect(own.axis) : IDENTITY,
  };
};

/** Parity that is correct for negatives and floors a fractional count — a turn is whole. */
function mod2(turns: number): number {
  return ((Math.trunc(turns) % 2) + 2) % 2;
}
