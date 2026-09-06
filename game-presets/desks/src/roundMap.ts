// THE ROUND DESK — a felt with no corners, and nothing on it but the cards and the table itself.
//
// A card table is a CIRCLE, and that is not decoration: a rectangle has four places nobody sits and
// a diagonal along which a piece is furthest from every hand at once. The round felt has one
// distance and one border, so "the middle" and "the edge" are the only two places there are.
//
// NO ANONYMOUS AREAS. `liveMap` seats two boxes at two fixed points and a player is whoever happens
// to be nearest one; here there is no such thing to be near. What a card is DOING is a game's
// knowledge and not this desk's, and two nameless areas on a felt this size would be two magnets
// fighting over every drop.
//
// WHAT THERE IS instead is a HAND PER PERSON, which is not the same thing: it is not a place on the
// felt that a card may go, it is a place a PLAYER has, and it is the very ring that player sits at
// (`seatPlace.ts`). Empty it is a mark; dealt to, it grows to what it holds; and its owner may shut
// it, after which nobody else puts anything in or takes anything out.
//
// The border is a WALL and not a drawing (`roundWalls`): a card may not be carried across it and a
// card thrown at it comes back. A desk whose edge is only painted is a desk whose pieces are lost
// off it the first time somebody flicks one.

import {
  add,
  Bounded,
  Carry,
  circle,
  compose,
  Container,
  freeLayout,
  Grabber,
  Heaping,
  installStockGrabs,
  node,
  registerLayout,
  registerSurface,
  setFacing,
  Surfaced,
  Transformable,
  extentOf,
  fieldsOf,
  type BoundedFields,
  type Node,
  type Paint,
  type RingWalls,
  type Vec,
} from "game-kit";
import { cards as crossadeCards } from "@game-presets/cards";
import { installMapArt, LAMP, onTheDesk, warmingNodes } from "./felt.js";
import { LIVE, SEATS } from "./liveMap.js";
import { seatChairs } from "./seatPlace.js";

/** How far the felt reaches from the middle, in units — the one measurement a round desk has. */
export const ROUND_R = 6;

/**
 * Felt the camera may go OUTSIDE the circle, units — and it is nearly a table's worth, on purpose.
 *
 * A modest rim is what the desk OPENS with, and that part has not changed: the opening zoom is the
 * fit, and the fit here bottoms out at the camera's own `minZoom`, so how much room is declared past
 * the felt does not change the picture the table opens on at all.
 *
 * What it changes is where the eye may GO. A player's place is on the RIM (`seatPlaces`, at
 * `ROUND_R - 1`), and sitting at one's own place means having it in the middle of one's own glass —
 * which is what a tap on the ring asks for and what the idle glide does by itself (`idleReturn`,
 * `isHome`). The camera is held inside this room, so a room that stopped a table's width past the
 * middle stopped the eye a table's width short of the seat: the glide ran, clamped, and came to rest
 * somewhere in the middle of the felt — after which NOBODY at the desk was ever at their own place,
 * and the picture that says so (the filled ring, the disc taken off the felt) could never be seen.
 *
 * So the room is the felt PLUS enough behind a seat to put that seat under the reader: the place's
 * own distance from the middle, plus half a portrait phone's worth of desk at the opening zoom.
 */
const RIM = 6.5;

export const ROUND_SURFACE = "round.felt";
const ROUND_LAYOUT = "round.free";

/**
 * THE STRETCH THE CAMERA IS HELD INSIDE — the circle and `RIM` of felt round it.
 *
 * A rect, because a camera's content is a rect: the eye may go to the corners of the box the circle
 * is inscribed in, and there is nothing there to look at but the rim. The alternative — a room the
 * width of the circle alone — pins a phone held upright so the felt's top and bottom are unreachable.
 */
export function roundRoom(): { x: number; y: number; w: number; h: number } {
  const half = ROUND_R + RIM;
  return { x: -half, y: -half, w: half * 2, h: half * 2 };
}

/** Register everything the round desk points at by name. Idempotent — a re-render calls it again. */
export function installRoundArt(): void {
  installMapArt();
  installStockGrabs();
  registerLayout(ROUND_LAYOUT, freeLayout);
  // NO GRID. The map's felt is ruled because that page is about the map MOVING and a grid is the
  // only thing an eye can measure that against. Here nothing moves under the cards, and squares
  // drawn under a round table are the corners the shape was chosen to be rid of.
  registerSurface(ROUND_SURFACE, {
    layers: [{ paint: "sunkBg" }],
    // The felt's own edge, so the wall a card cannot cross is a thing the eye can see it reach.
    stroke: { color: "panelBorder", width: 0.06 },
  });
}

/**
 * THE ROUND DESK: one felt, one deck in the middle of it, and no zones at all.
 *
 * The deck is the same pack `liveMap` deals from and the same count, because a desk with fewer
 * cards on it is a different desk and not a smaller one — the pack is the game's, not the table's.
 */
export function roundMap(seats: readonly { readonly seat: string; readonly ink: Paint }[] = SEATS): Node {
  installRoundArt();
  const desk = node(
    "round desk",
    Bounded({ bounds: circle(ROUND_R) }),
    Container({ layout: ROUND_LAYOUT }),
    Surfaced({ surface: ROUND_SURFACE }),
    LAMP,
    Grabber({ grab: "one" }),
  );
  // A HAND PER PLACE, and it IS the place: the ring a player sits at is the patch their cards lie
  // in (`seatChairs(…, hands)`), so a desk built with nobody at it is still a desk with places on
  // it, and a page that has avatars has nothing further to put anywhere.
  //
  // THE CHAIRS FIRST, before a single card: a place is a thing on this felt, and equals in the plan
  // are ranked by document order — a chair added after the deck would be an outline over the cards.
  seatChairs(desk, seatPlaces(seats.length), seats.map(({ seat, ink }) => ({ seat, ink, name: seat })), true);
  crossadeCards()
    .slice(0, LIVE.cards)
    .forEach((card, i) => {
      // A DECK AND NOT A PILE OF ONE CARD: the sliver of each card showing under the next is what
      // makes a stack read as having depth from directly above, where there is no other way to say it.
      compose(card, Transformable({ at: { x: i * 0.004, y: -i * 0.012 } }));
      onTheDesk(card);
      compose(card, Heaping({ heap: "card" }));
      compose(card, Carry({ orient: "holder" }));
      setFacing(card, "up");
      add(desk, card);
    });
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}

export function seatPlaces(n: number): readonly { readonly at: Vec; readonly facing: number }[] {
  return Array.from({ length: n }).map((_, i) => {
    const turn = (Math.PI * 2 * i) / n;
    return {
      at: { x: Math.sin(turn) * (ROUND_R - 1), y: Math.cos(turn) * (ROUND_R - 1) },
      facing: (turn * 180) / Math.PI,
    };
  });
}

/**
 * WHERE A PIECE ON THIS DESK MAY GO — the felt, inset by the piece's own reach from its middle.
 *
 * The inset is the HALF-DIAGONAL and not half the width: a card is carried and thrown at whatever
 * angle the hand left it at, and a border that allowed half its width would let a corner over the
 * edge every time it was turned. The one number that is true at every angle is the corner's own
 * distance from the anchor.
 *
 * The same tray for the hand and for the throw. They are one question — where may this piece be —
 * and answered twice they would differ, which reads as a card that may be carried somewhere it
 * cannot be thrown.
 */
export function roundWalls(piece: Node): RingWalls {
  const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
  const size = shape ? extentOf(shape) : { w: 0, h: 0 };
  const reach = Math.hypot(size.w, size.h) / 2;
  // A piece bigger than the felt has nowhere to stand: the tray collapses to the middle rather than
  // turning inside out, which is what a negative radius would do.
  return { cx: 0, cy: 0, r: Math.max(0, ROUND_R - reach) };
}
