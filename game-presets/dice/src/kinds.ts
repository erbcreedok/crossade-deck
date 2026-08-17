// THE KINDS — which dice exist in this add-on and what each one IS as data: how many faces, what
// silhouette it shows from above, how big it is. Nothing of the look (that is `textures/` and the
// skin) and nothing of the throw (that is the engine's runtime): a kind is the record the builder
// stamps and the skin draws for.

import { polygon, rect, type Shape } from "game-kit";

export type DieKind = "d4" | "d6" | "d20";

export interface DieSpec {
  readonly kind: DieKind;
  /** How many faces — the truth `Rollable.sides` carries. */
  readonly sides: number;
  /** The silhouette seen from above, in units, centred: a die is roughly one unit across. */
  readonly shape: Shape;
  /** The corner the skin's face is clipped to (a d6 is soft, a d4 and a d20 are sharp). */
  readonly radius: number;
}

/** A die's size across, in units — the proportion the textures are drawn at. */
export const DIE_SIZE = 0.9;

const KINDS: Record<DieKind, DieSpec> = {
  // The tetrahedron from above: one face up, a triangle. Its numeral sits at the top corner.
  d4: { kind: "d4", sides: 4, shape: polygon(3, DIE_SIZE * 0.62), radius: 0 },
  // The cube from above: a soft square, pips.
  d6: { kind: "d6", sides: 6, shape: rect(DIE_SIZE, DIE_SIZE), radius: 0.12 },
  // The icosahedron from above: a hexagonal outline with the top triangle inside.
  d20: { kind: "d20", sides: 20, shape: polygon(6, DIE_SIZE * 0.58), radius: 0 },
};

export const DIE_KINDS: readonly DieKind[] = ["d4", "d6", "d20"];

export function dieSpec(kind: DieKind): DieSpec {
  return KINDS[kind];
}
