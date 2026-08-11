// OWNED — which BOX an element came out of, by reference. Read by `reconcile` and by the recall of
// an owner's own pieces, and by `AcceptRule` through `el.box` (the second asker). A reference, not
// the box itself: the box is a set-level thing, and copying it onto every element would be a second
// place for the same truth to live.

import { defineAtom } from "../atom.js";

export interface OwnedFields {
  /** A reference to the box this element belongs to. Empty string when it belongs to none. */
  readonly box: string;
}

export const Owned = defineAtom<OwnedFields>({
  name: "Owned",
  requires: [],
  defaults: { box: "" },
  classes: { box: "own" },
});
