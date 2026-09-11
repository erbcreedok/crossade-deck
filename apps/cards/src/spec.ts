// THE CARD TABLE, AS DATA — every field here is one of the questions the runtime asks, and together
// they are the whole of what makes this game this game.
//
// It used to be nine `if (game === "cards")` branches scattered through a desk shared with chess and
// nardy. Nothing below is new; what is new is that it can be read in one sitting, and that adding a
// tenth card game means writing another one of these rather than an eleventh branch.

import {
  ANCHOR_MARK,
  handRule,
  LIVE_UNIT,
  ROUND_R,
  roundMap,
  roundPlaces,
  roundRoom,
  roundWalls,
} from "@game-presets/desks";
import { handLayer, type HandLayer } from "@game-presets/hand";
import { installTableLook } from "@crossade/look";
import type { DeskSpec } from "@game-presets/desk";
import { GRIP_SPEC, heapOf, ROUND_HOME_SPAN, type LiveStage, type LiveTableOptions, type Node } from "game-kit";

/** How many people sit at this table. */
export const CARD_SEATS = 2;

/** A piece heaps by the name it carries (`Heaping`) — what makes a pile a pile. */
function heapKindOf(n: Node): string {
  return heapOf(n) ?? "";
}

/**
 * THE CARD TABLE. The hand on the glass and the chairs it is a picture of arrive as a layer
 * (`@game-presets/hand`), and the SAME layer object answers the questions `play` has to ask about a
 * hand — one hand, asked twice, rather than two that could disagree.
 */
export function cardsSpec(): DeskSpec {
  const places = roundPlaces(CARD_SEATS);
  const hand: HandLayer = handLayer({ places });

  return {
    id: "cards",
    title: "Карты",
    seats: CARD_SEATS,
    // THE ROUND TABLE and not the catalog's live desk. That one seats two hand areas, because the
    // page it belongs to is about a card changing owner; a table people sit at has no zone that is
    // somebody's, and its felt is a circle a card cannot be taken out of.
    //
    // NO RING WITHOUT A PLAYER: built with no seats at all — the roster is not known at this point,
    // it arrives from the room after the desk is already up — and the hand layer puts one up per
    // seat once it is.
    map: () => roundMap([]),
    places: (seats) => roundPlaces(seats),
    room: () => roundRoom(),
    unit: LIVE_UNIT,
    // THE ROUND TABLE'S OWN SPAN — owner: the table's diameter is 1.5× the glass. Measured ACROSS
    // THE FELT and not the room: the room is the felt plus half a glass behind every seat, and a
    // span measured across that opens the table at a third of the size that was asked for.
    home: { span: ROUND_HOME_SPAN, width: ROUND_R * 2 },
    // A HAND PER PERSON, and how far out it stands.
    handsRadius: ROUND_R,
    layers: [hand],
    look: installTableLook,
    play: (): LiveTableOptions<LiveStage> => ({
      zones: (root, at, lead, from) => hand.zoneAt(root, at, lead, from),
      // WHAT IS TOUCHING WHAT IS A HEAP, and a heap gets a handle — the deck's own tab.
      stacking: true,
      heapKindOf,
      // ...AND A HAND IS ITS OWNER'S ARRAY (`handRule`): its own handle lifts its cards and whatever
      // was thrown onto the box while it is open, and nothing on the felt is islanded with a card
      // inside a hand.
      rule: handRule(),
      grip: GRIP_SPEC,
      // A THROW IS ON: a card flicked across the felt travels, which is the whole of a card table.
      letGo: "throw",
      // ...AND A TAP TURNS WHAT IT LANDED ON, which on a closed pile is the top of the deck.
      flipping: true,
      // THE PAGE IS A WALL TO A RELEASE AND THE FELT A TRAP — and NOTHING to a hand: a card is
      // carried wherever the finger goes, off the page too, and it is the DROP that decides. A tray
      // on the carry would end the gesture at the page's edge and fling the card back the moment the
      // finger crossed it, which is the one thing a finger holding a card must never feel. Said
      // outright, because a desk that says nothing gets the kit's own box.
      trayOf: () => undefined,
      pieces: { wallsOf: (piece: Node) => roundWalls(piece) },
      anchorMark: ANCHOR_MARK,
      // A SHUT HAND CANNOT BE REACHED INTO, and a ring is its owner's alone to move.
      may: (n, via) => hand.may(n, via),
      // A TAP ON A CARD AT A CHAIR TURNS NOTHING: the indicator is looked at, not played.
      taps: (piece) => hand.taps(piece),
    }),
  };
}
