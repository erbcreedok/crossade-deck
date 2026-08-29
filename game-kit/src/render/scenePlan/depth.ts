// The one number the lamp counts height in. Its own file so both the plan and the shadow law can
// read it without either one owning the other.

/** How thick one `z` is, root units — a card. It is what turns a hop's HEIGHT into the lamp's layers. */
export const LAYER_HEIGHT = 0.05;

/**
 * How much a piece GROWS per unit of height off the desk — the whole of "it is up in the air" as
 * far as a flat desk seen from above can say it. The shadow answers with the same number the other
 * way: it falls further, so THE GAP BETWEEN A PIECE AND ITS SHADOW IS THE HEIGHT.
 *
 * It lives here, beside `LAYER_HEIGHT`, because that contract has two sides and neither owns it:
 * the clock grows a flying body by it, and the lamp lengthens a fall by it. Kept on one side, the
 * other side drifts — which is exactly what happened to a HELD piece, whose lift is a size and
 * whose shadow was a fixed length, so a pack raised two and a half times cast the shadow of a card
 * raised by a twentieth.
 */
export const RISE = 0.5;
