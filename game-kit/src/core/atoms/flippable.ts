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
