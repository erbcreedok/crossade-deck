// WHAT EVERY CARD GAME ON THIS SHELF SHARES — the player's own hand at the foot of the glass, the
// chairs it is a picture of, and the rules a gesture asks about a hand.
//
// A `DeskLayer` for `@game-presets/desk`: a card table is a desk plus this. Durak, poker and bridge
// take it whole; the board games take none of it, and the runtime under both knows about neither.

export { handLayer, type HandLayer, type HandLayerOptions } from "./handLayer.js";
export { syncSeatChairs } from "./seatChairs.js";
