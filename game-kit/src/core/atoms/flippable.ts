// FLIPPABLE — the card turn. Which FACE shows when the element is turned over is a pure question of
// DATA: the front is the node's `Surfaced.surface`; the reverse is one of four relations to it.
//
//   same   — a token that looks identical both sides: the front again.
//   mirror — the front, flipped across the axis (a translucent tile seen from behind).
//   back   — a separate surface: the card back, usually shared across a deck.
//   alt    — a separate surface too, but a per-card ALTERNATE face (a two-faced tile).
//
// Which SIDE is up is runtime state, not spec — it is passed in, never stored here. `axis` says
// which way the turn goes (and which way `mirror` mirrors). Requires `Surfaced`: no face, nothing
// to turn. See CANONS.md §3 (the atom table) and NIGHT-DECISIONS.md.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";
import { type SurfacedFields } from "./surfaced.js";

export interface FlippableFields {
  /** How the reverse side relates to the front. */
  readonly reverse: "back" | "same" | "mirror" | "alt";
  /** The turn's axis: `y` flips left-right (the usual card turn), `x` flips top-over-bottom. */
  readonly axis: "x" | "y";
  /** The reverse surface for `back`/`alt`. Empty falls back to the front, so a turn never blanks. */
  readonly back: string;
}

export const Flippable = defineAtom<FlippableFields>({
  name: "Flippable",
  requires: ["Surfaced"],
  defaults: { reverse: "back", axis: "y", back: "" },
  classes: { reverse: "own", axis: "own", back: "own" },
});

/** The surface a face shows, and whether it is mirrored — everything the renderer needs to draw it. */
export interface Face {
  readonly surface: string;
  readonly mirror: boolean;
  readonly axis: "x" | "y";
}

/**
 * The face shown for a given up/down state. Face-up is always the front; face-down follows `reverse`.
 * `undefined` when the node has no `Surfaced` at all — there is no face to show. A node with a face
 * but no `Flippable` simply shows its front either way (nothing to turn).
 */
export function shownFace(node: Node, faceUp: boolean): Face | undefined {
  const surf = fieldsOf<SurfacedFields>(node, "Surfaced");
  if (!surf) return undefined;
  const front = surf.surface;
  const flip = fieldsOf<FlippableFields>(node, "Flippable");
  if (!flip || faceUp) return { surface: front, mirror: false, axis: flip?.axis ?? "y" };
  switch (flip.reverse) {
    case "same":
      return { surface: front, mirror: false, axis: flip.axis };
    case "mirror":
      return { surface: front, mirror: true, axis: flip.axis };
    case "back":
    case "alt":
      return { surface: flip.back || front, mirror: false, axis: flip.axis };
  }
}
