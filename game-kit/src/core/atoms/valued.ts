// VALUED — the element's game DATA: rank, suit, points, whatever the set declares. Not geometry,
// not text for the eye — the values rules read and sorts order by. `AcceptRule` reads them through
// `el.values.X`, which is the second asker that earns this atom its place.
//
// The values are `own`: a card's rank is about the card, never inherited from the pile. And they
// are DATA — a function in here would neither travel the wire nor be read by a rule, so the spec
// guard refuses one.

import { defineAtom } from "../atom.js";

export interface ValuedFields {
  /** The declared fields of the element's set — `{ rank: 7, suit: "hearts" }`. Data only. */
  readonly values: Readonly<Record<string, unknown>>;
}

export const Valued = defineAtom<ValuedFields>({
  name: "Valued",
  requires: [],
  defaults: { values: {} },
  classes: { values: "own" },
});
