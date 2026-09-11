// THE CHESSBOARD, AS DATA — the shortest spec on the shelf, and that is the point.
//
// Four lines of `play` is everything that makes a board a board: nothing stacks, nothing is thrown,
// nothing shows a landing picture, and what is under the finger is a SQUARE. There is no hand layer
// and no `handsRadius`: a man is on a square and nowhere else, and a patch of felt beside a player
// would be a place the game has no word for.
//
// THE MEN FACE THE READER AND NOT THE DESK, and that is not here either — it is `Oriented: "viewer"`
// on the pieces in `chessMap`, the same billboard captions and marks already use. A rule that looks
// like it should be a runtime branch turns out to be one atom in the map.

import { ANCHOR_MARK, CHESS_UNIT, chessMap, chessPlaces, chessRoom, squareAt } from "@game-presets/desks";
import { installTableLook } from "@crossade/look";
import type { DeskSpec } from "@game-presets/desk";
import type { LiveStage, LiveTableOptions, Node } from "game-kit";

/** How many people sit at this board. */
export const CHESS_SEATS = 2;

export function chessSpec(): DeskSpec {
  return {
    id: "chess",
    seats: CHESS_SEATS,
    map: () => chessMap(),
    places: (seats) => chessPlaces(seats),
    room: () => chessRoom(),
    unit: CHESS_UNIT,
    // A BOARD NAMES NO SPAN: chess is played on the whole board at once, and the kit's own fit is
    // the picture wanted. `home` left out entirely rather than set to something.
    look: installTableLook,
    play: (): LiveTableOptions<LiveStage> => ({
      // A SQUARE A MAN WAS LIFTED FROM is not put back into by the zone's own hand-over: the ordinary
      // drop already sets the piece down on the seat it left, and a board's places do not reach, so
      // there is no pull to give back through.
      zones: (root: Node, at, _lead, from) => {
        const square = squareAt(root, at);
        return square && square === from ? undefined : square;
      },
      // NO STACKING and NO THROW. A board has no heaps: pieces do not pile up on a square, they take
      // each other's place — so there are no handles to draw and nothing for one to lift.
      letGo: "drop",
      // THE LANDING PICTURE IS OFF on a board: the lit square already says where the man is going.
      landingShown: false,
      anchorMark: ANCHOR_MARK,
    }),
  };
}
