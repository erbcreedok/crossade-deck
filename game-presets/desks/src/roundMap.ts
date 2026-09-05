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
// WHAT THERE IS instead is a HAND PER PERSON (`handZone`), which is not the same thing: it is not a
// place on the felt that a card may go, it is a place a PLAYER has, and it stands wherever that
// player's avatar is. Empty it is a mark; dealt to, it grows to what it holds; and its owner may
// shut it, after which nobody else puts anything in or takes anything out.
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
import { growHand, handZone, placeHand } from "./handZone.js";
import { LIVE, SEATS } from "./liveMap.js";

/** How far the felt reaches from the middle, in units — the one measurement a round desk has. */
export const ROUND_R = 6;

/**
 * Felt shown OUTSIDE the circle when the desk opens, units — the same modest rim chess opens with.
 *
 * Room for the camera to stand off the table rather than a second table's worth of nothing: a
 * quarter of the glass given to margin all the time is a desk drawn at three quarters of its size.
 */
const RIM = 1.2;

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
  // A HAND PER PLACE, standing where that place opens.
  //
  // The desk seats them at the rim on its own, because a desk built with nobody at it still has to
  // be a desk: a page that has avatars re-places every hand against its own person (`placeHand`),
  // and one that has none — the hub's card table — gets them where a player would sit anyway. The
  // spot is worked out by the SAME line either way, from a stand-in standing on the rim, so the two
  // cannot drift apart.
  seats.forEach(({ seat, ink }, i) => {
    const hand = handZone(seat, ink);
    growHand(hand);
    placeHand(desk, seatMark(i, seats.length), hand, ROUND_R);
  });
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

/**
 * WHERE A PLACE OPENS, when nobody is sitting in it yet — a point on the rim, one per seat, evenly
 * round the table and starting at the bottom, which is where the reader's own place is.
 *
 * A bare node and not a picture: `placeHand` asks a person for two things only, the spot they stand
 * on and how big they are drawn, and a stand-in that answers both is the whole of what an empty
 * chair is.
 */
function seatMark(i: number, of: number): Node {
  const turn = (Math.PI * 2 * i) / of;
  return node(
    `seat ${i}`,
    Bounded({ bounds: circle(0.55 / 2) }),
    Transformable({ at: { x: Math.sin(turn) * (ROUND_R - 1), y: Math.cos(turn) * (ROUND_R - 1) } }),
  );
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
