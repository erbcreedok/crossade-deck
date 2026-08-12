// A DECK, as ordinary data expanded into cards. A set names its cards once — a face, maybe a back,
// maybe some values, and how many of each — and `deck(specs)` hands back one node per physical card.
//
// It is the ready-made where the card ATOMS meet: every card is `Bounded` (it has a size to hit and
// draw), `Surfaced` (it shows a face), `Flippable` WHEN a back is named (a two-sided card turns), and
// `Valued` WHEN the set declares data (rank, suit — what a rule reads). What it is NOT is interactive:
// a card's identity is its face and data, not its drag or grip — the consumer adds those to taste.
// Ids are `${face}#${n}`, unique across the expansion so the tree accepts every copy. Like `arrow`,
// this builds nodes; the layers below keep working when this file is empty.

import { type Atom } from "../core/atom.js";
import { node, type Node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Flippable } from "../core/atoms/flippable.js";
import { Valued } from "../core/atoms/valued.js";
import { rect } from "./shapes.js";

export interface CardSpec {
  /** The face the card shows — a surface name. */
  readonly face: string;
  /** The reverse surface, when the card is two-sided. Omit for a card the same both ways. */
  readonly back?: string;
  /** How many physical copies of this card. Default 1. */
  readonly count?: number;
  /** The set's declared data for the card — rank, suit, points. */
  readonly values?: Readonly<Record<string, unknown>>;
}

export interface DeckOptions {
  /** The size every card is cut to, in units. Default 1×1.4 — the usual card proportion. */
  readonly size?: { readonly w: number; readonly h: number };
}

/**
 * Expand a set's card specs into one node per physical card. A `count` of 3 yields three nodes with
 * distinct ids; a named `back` makes the card `Flippable`; declared `values` add `Valued`. The order
 * is the spec order, copies together.
 */
export function deck(specs: readonly CardSpec[], opts: DeckOptions = {}): Node[] {
  const { w, h } = opts.size ?? { w: 1, h: 1.4 };
  const bounds = Bounded({ bounds: rect(w, h) });
  const cards: Node[] = [];
  for (const spec of specs) {
    const copies = spec.count ?? 1;
    for (let n = 0; n < copies; n++) {
      const atoms: Atom[] = [bounds, Surfaced({ surface: spec.face })];
      // A named back makes the card turn over: the `turnOver` recipe reflects the geometry AND shows
      // the back surface. No back and there is no `Flippable` at all — a one-sided card does not turn.
      if (spec.back !== undefined) atoms.push(Flippable({ flip: "turnOver", back: spec.back }));
      if (spec.values !== undefined) atoms.push(Valued({ values: spec.values }));
      cards.push(node(`${spec.face}#${n}`, ...atoms));
    }
  }
  return cards;
}
