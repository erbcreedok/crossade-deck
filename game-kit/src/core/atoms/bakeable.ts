// BAKEABLE — the node's own answer to "should my geometry be folded, or handed over as a
// matrix?". The renderer asks; the node answers; nobody keeps a list.
//
// The decision used to live entirely in the consumer, as a predicate handed to `attachPainter`,
// and that is where it went wrong: the predicate had to KNOW every node worth baking, so it
// grew into a table of names in a file that had nothing else to do with any of them. A fact
// about a card belongs on the card.
//
// NO FIELDS, AND THAT IS THE WHOLE POINT. Presence declares it, absence declines it — the
// canon's own rule, and a `bake: false` field would be exactly the `disabled` flag the model
// does not have. Switching a node's mind is done by adding or dropping the atom; switching the
// WHOLE SCENE's mind is done at the painter, which takes a predicate and can therefore say
// "everyone", "nobody", or anything narrower than either.
//
// It requires `Surfaced` because baking is an operation on a QUAD, and a node that paints
// nothing produces none. On such a node the atom would be a control over nothing — the same
// mistake `fit` and `align` made on `Surfaced` before they moved to the layer.
//
// WHAT IT MEANS, in the model's own terms, is "this does not move". Baking is the renderer's
// conclusion from that, not the statement itself — which is why the day movement becomes an
// atom, this one can be derived instead of declared, and every tree that says it by hand keeps
// working. Until then it is said by hand.

import { defineAtom } from "../atom.js";
import { caps, type Node } from "../node.js";

/** No fields. Kept as a name so the atom reads like its neighbours and can grow one honestly. */
export type BakeableFields = Record<string, never>;

export const Bakeable = defineAtom<BakeableFields>({
  name: "Bakeable",
  requires: ["Surfaced"],
  defaults: {},
  classes: {},
});

/**
 * The default answer to `attachPainter`'s `bake` — ask the node.
 *
 * Exported as an ordinary function so it can be USED as well as defaulted to: a consumer that
 * wants "what the nodes say, except while this one is in flight" writes it as
 * `(n) => bakeable(n) && !flying.has(n.id)` rather than reimplementing the first half.
 */
export function bakeable(n: Node): boolean {
  return caps(n).has("Bakeable");
}
