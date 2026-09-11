// THE NARDY BOARD, AS DATA — the only desk on the shelf with dice, and the whole of what that costs
// is four fields.
//
// It is the widest of the three specs without being the most complicated: a full set of piece rules
// (a column of checkers is one RUN, with the point's own idea of how it stands in the hand) plus the
// dice, which are the reason the desk has a second half at all.

import {
  ANCHOR_MARK,
  mayThrow,
  NARDY_BUMP,
  NARDY_UNIT,
  nardyMap,
  nardyPlaces,
  nardyRoom,
  pointUnder,
  runOf,
  seatsOf,
  settled,
  wallsOf,
} from "@game-presets/desks";
import { throwDie } from "@game-presets/dice";
import { installTableLook } from "@crossade/look";
import type { DeskSpec } from "@game-presets/desk";
import type { LiveStage, LiveTableOptions, Node } from "game-kit";

/** How many people sit at this board. */
export const NARDY_SEATS = 2;

export function nardySpec(): DeskSpec {
  return {
    id: "nardy",
    seats: NARDY_SEATS,
    map: () => nardyMap(),
    places: (seats) => nardyPlaces(seats),
    room: () => nardyRoom(),
    unit: NARDY_UNIT,
    // A BOARD NAMES NO SPAN — the kit's own fit takes in the whole board, which is how it is played.
    look: installTableLook,
    play: (): LiveTableOptions<LiveStage> => ({
      // A POINT A CHECKER WAS LIFTED FROM is not handed back to by the zone — the ordinary drop
      // already sets it down where it left.
      zones: (root: Node, at, lead, from) => {
        const point = pointUnder(root, at, lead);
        return point && point === from ? undefined : point;
      },
      // A THROW IS ON, always: the dice are the whole reason the desk has a second half.
      letGo: "throw",
      bump: NARDY_BUMP,
      // A DIE SET DOWN KEEPS ITS FACE: only a throw changes the number, so a die moved out of the
      // way is not a roll.
      ways: { die: "toss" },
      // A COLUMN OF CHECKERS IS ONE RUN, and the point's own idea of how it stands in the hand.
      pieces: { runOf, offsetOf: seatsOf, wallsOf, mayThrow, settled },
      onRoll: throwDie,
      anchorMark: ANCHOR_MARK,
    }),
  };
}
