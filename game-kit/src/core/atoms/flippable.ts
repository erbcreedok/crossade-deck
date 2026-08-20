// FLIPPABLE — the turn, as DATA and nothing else. A flip is not "swap one surface": it is GEOMETRY
// (a reflection the children inherit) plus, sometimes, a change of CONTENT (the other face is a whole
// other subtree). One toy field could model a card's face and none of the rest, so the atom holds the
// four data a turn actually needs and leaves the DOING to a recipe in the registry, exactly as
// `Surfaced` names a record it does not contain. See `docs/FLIPPABLE-HANDOFF.md`.
//
//   flip  — the recipe NAME in `render/flips.ts`. "" ≡ "mirror", the pure geometric reflection.
//   turns — how many turns from the authored state. It SUMS along the chain (`addsUp`): a stack
//           turned once turns every child once, and a child turned back is face-up again because the
//           two turns sum to even. The current side is this parity, never a stored boolean.
//   axis  — the reflection line, in degrees, as a PARAMETER — 90 is a Y-mirror, 76 is a 76° one. A
//           value on the atom, not a preset per angle (the `Axis76` lesson), read by mirror recipes.
//   back  — the down-side surface a surface-swap recipe (turnOver) reveals. "" ≡ same both sides, so
//           a token identical on both faces needs no back and a half-built card never turns up blank.
//
// Which side is up is not stored: it is the parity of `turns`, resolved at apply time. The recipe
// decides what the turn DOES; the engine mixes it in through the effects list, blind.

import { defineAtom } from "../atom.js";
import { compose, fieldsOf, type Node } from "../node.js";
import { contextFor, sumAlongChain } from "../resolve.js";

export interface FlippableFields {
  /** Recipe name in the flips registry. "" ≡ "mirror" — a pure reflection that swaps nothing. */
  readonly flip: string;
  /** Turns from the authored state. SUMS along the chain — a stack turns its children. */
  readonly turns: number;
  /** The reflection line, in degrees. A parameter, not a preset per angle. 90 = Y-mirror. */
  readonly axis: number;
  /** The down-side surface a surface-swap recipe reveals. "" falls back to the front, never blank. */
  readonly back: string;
}

export const Flippable = defineAtom<FlippableFields>({
  name: "Flippable",
  // A face is NOT required: a container, a stack, the desk itself all turn, and none of them draws a
  // surface of its own. The effect skips a node with nothing to reflect.
  requires: [],
  defaults: { flip: "", turns: 0, axis: 90, back: "" },
  // `turns` is the one summed field — the parity is inherited. The rest are the node's own.
  classes: { flip: "own", turns: "addsUp", axis: "own", back: "own" },
});

/** Which side shows: `up` is face, `down` is back. A read, not a stored flag. */
export type Facing = "up" | "down";

/**
 * The inspector's "which side is up NOW". It reads the SAME summed parity the flip effect uses, so a
 * tool and the painted picture can never disagree: even summed turns is face-up, odd is the back. A
 * fractional or broken count is floored to a whole turn, exactly as the effect floors it.
 */
export function facing(n: Node): Facing {
  return parity(sumAlongChain(contextFor(n, 1), "Flippable", "turns"));
}

/** Even turns show the face, odd the back. A fractional or broken count floors, as the effect does. */
function parity(turns: number): Facing {
  return (((Math.trunc(turns) % 2) + 2) % 2) === 0 ? "up" : "down";
}

/**
 * The node's OWN side — its bit alone, with no owner's turn folded in.
 *
 * The twin of `facing`, and the distinction is the whole of the two-bit model: a card in a closed
 * deck is face-UP by this reading and face-down by `facing`, because the deck is the turned thing.
 * That is what makes drawing it into an open hand show the face without writing to the card.
 */
export function ownFacing(n: Node): Facing {
  return parity(fieldsOf<FlippableFields>(n, "Flippable")?.turns ?? 0);
}

/**
 * Turn a node to show a given side — the WRITER paired with `facing`. It TOGGLES rather than
 * assigns: a node already showing `side` is left alone, otherwise ONE turn is added, so the parity
 * flips to what was asked while the count keeps CLIMBING — a settle then animates the reveal as one
 * continuous turn forward, never a jump back to zero. It reads `facing`, so it is right about a card
 * inside a turned stack too. A node with no Flippable of its own has nothing to turn and is untouched.
 */
export function setFacing(n: Node, side: Facing): void {
  if (facing(n) === side) return;
  const own = fieldsOf<FlippableFields>(n, "Flippable");
  if (!own) return;
  compose(n, Flippable({ ...own, turns: own.turns + 1 }));
}
