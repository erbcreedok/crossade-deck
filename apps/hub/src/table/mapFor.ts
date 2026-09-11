// WHICH BOARD A TABLE BUILDS — one function of the `game` id the server hands back in `welcome`
// (or, on the very first frame before it arrives, the id already carried in the URL). Kept apart
// from `index.ts` so a unit test can hit it without mounting a host or opening a socket.
import { chessMap, nardyMap, roundMap } from "@game-presets/desks";
import type { Node } from "game-kit";

/** How many people this shelf's desks seat — the same two the room is created with. */
export const TABLE_SEATS = 2;

export type TableGame = "cards" | "chess" | "nardy";

export function isTableGame(id: string | undefined): id is TableGame {
  return id === "cards" || id === "chess" || id === "nardy";
}

/** Builds the board for a table game id. Unknown ids fall back to the card table. */
export function mapFor(id: string | undefined): Node {
  if (id === "chess") return chessMap();
  if (id === "nardy") return nardyMap();
  // THE ROUND TABLE and not the catalog's live desk. That one seats two hand areas, because the
  // page it belongs to is about a card changing owner; a table people sit at has no zone that is
  // somebody's, and its felt is a circle a card cannot be taken out of (`roundMap`).
  //
  // NO RING WITHOUT A PLAYER: built with no seats at all — the roster is not known yet at this
  // point (it arrives from `joinTable`, after the desk is already up) — and `syncSeatChairs`
  // (`@game-presets/hand`) puts one up per seat once it is.
  return roundMap([]);
}
