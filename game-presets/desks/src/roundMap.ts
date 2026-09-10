// THE ROUND DESK — a felt with no corners on a PAGE (the game zone), and nothing on it but the
// cards, the chairs and the table itself.
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
  rect,
  type Paint,
  type TrapWalls,
  type Vec,
} from "game-kit";
import { cards as crossadeCards } from "@game-presets/cards";
import { installMapArt, LAMP, onTheDesk } from "./felt.js";
import { LIVE, SEATS } from "./liveMap.js";
import { seatChairs } from "./seatPlace.js";

/** How far the felt reaches from the middle, in units — the one measurement a round desk has. */
export const ROUND_R = 8;

/**
 * THE PAGE — the game zone, and the whole of it: a square of `ROUND_PAGE` half a side round the
 * felt, the felt standing in the middle of it. A card is carried anywhere on the page and never
 * off it; a throw bounces off its edge; the camera is held inside it. Nothing lies beyond the page
 * — "if the camera cannot see it, a card does not fly there" — so the page is the room too.
 */
export const ROUND_PAGE = ROUND_R + 4;

/**
 * THE TABLE'S EDGE, as the design draws it — three rings out from the felt: a black keyline, the
 * dark wood, and a lighter wood inside it, the design's 3, 11 and 6 px over its 74 px chair, in
 * units of that chair (`ARCH_R`). Drawn as three discs under the felt, largest first.
 */
export const ROUND_EDGE = { line: 0.09, dark: 0.33, light: 0.18 } as const;
/** How far the edge stands out past the felt, in units — the three rings together. */
export const ROUND_RIM = ROUND_EDGE.line + ROUND_EDGE.dark + ROUND_EDGE.light;

/** The design's own table colours — content, like the chair's wood (`SEAT_LOOK`), never a theme token. */
export const ROUND_LOOK = {
  feltHi: "#1b4835",
  feltMid: "#123527",
  feltLo: "#0a2117",
  black: "#0b0704",
  woodDark: "#3a2a1d",
  woodLight: "#6b4d2c",
  /** The page's own edge — the game zone's border, read against the wallpaper behind it. */
  edge: "#f2c14e",
} as const;

export const ROUND_SURFACE = "round.felt";
/** The page, the edge's three rings and the felt, by the names their nodes point at. */
export const ROUND_PAGE_SURFACE = "round.page";
const ROUND_LINE_SURFACE = "round.edge.line";
const ROUND_DARK_SURFACE = "round.edge.dark";
const ROUND_LIGHT_SURFACE = "round.edge.light";
const ROUND_LAYOUT = "round.free";
/** The felt's own node, and the edge's — children of the page, before anything that lies on them. */
export const ROUND_FELT = "round felt";

/**
 * THE STRETCH THE CAMERA IS HELD INSIDE — the page, exactly. A room wider than the page would be
 * felt a card cannot reach; a room narrower would be page the eye cannot see.
 */
export function roundRoom(): { x: number; y: number; w: number; h: number } {
  return { x: -ROUND_PAGE, y: -ROUND_PAGE, w: ROUND_PAGE * 2, h: ROUND_PAGE * 2 };
}

/** Register everything the round desk points at by name. Idempotent — a re-render calls it again. */
export function installRoundArt(): void {
  installMapArt();
  installStockGrabs();
  registerLayout(ROUND_LAYOUT, freeLayout);
  // THE PAGE IS AN EDGE AND NOTHING ELSE: the wallpaper behind it shows through, and the line says
  // where the game zone ends — the one place a card can never be carried past.
  registerSurface(ROUND_PAGE_SURFACE, { layers: [], stroke: { color: ROUND_LOOK.edge, width: 0.06, opacity: 0.5, dash: { on: 0.3, off: 0.2 } } });
  registerSurface(ROUND_LINE_SURFACE, { layers: [{ paint: ROUND_LOOK.black }] });
  registerSurface(ROUND_DARK_SURFACE, { layers: [{ paint: ROUND_LOOK.woodDark }] });
  registerSurface(ROUND_LIGHT_SURFACE, { layers: [{ paint: ROUND_LOOK.woodLight }] });
  // THE FELT, LIT FROM ABOVE THE MIDDLE — the design's radial wash, said as the kit's linear one:
  // brightest a little above the centre, darkest at the far edge.
  registerSurface(ROUND_SURFACE, {
    layers: [{ gradient: { stops: [{ at: 0, paint: ROUND_LOOK.feltMid }, { at: 0.3, paint: ROUND_LOOK.feltHi }, { at: 1, paint: ROUND_LOOK.feltLo }], angle: 90 } }],
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
  // THE DESK IS THE PAGE: the game zone, a square with the table standing in the middle of it. The
  // table — its edge and its felt — is furniture on the page, drawn first so everything lies on it.
  const desk = node(
    "round desk",
    Bounded({ bounds: rect(ROUND_PAGE * 2, ROUND_PAGE * 2) }),
    Container({ layout: ROUND_LAYOUT }),
    Surfaced({ surface: ROUND_PAGE_SURFACE }),
    LAMP,
    Grabber({ grab: "one" }),
  );
  // Z BELOW THE KIT'S OWN PRESENCE CONE (`CONE_Z`, -1 in `presence.ts`): the felt and its edge are
  // not `root` itself, so the plan's "ground" rank does not catch them, and without a z of their
  // own they tied at 0 with the cone's -1 the same as any ordinary piece would — a cone sent under
  // every piece on the felt sank under the felt too, the one thing it was meant to lie on.
  const still = (id: string, r: number, surface: string): Node =>
    node(id, Bounded({ bounds: circle(r) }), Surfaced({ surface }), Transformable({ at: { x: 0, y: 0 }, z: -2 }));
  add(desk, still("round edge line", ROUND_R + ROUND_RIM, ROUND_LINE_SURFACE));
  add(desk, still("round edge dark", ROUND_R + ROUND_EDGE.dark + ROUND_EDGE.light, ROUND_DARK_SURFACE));
  add(desk, still("round edge light", ROUND_R + ROUND_EDGE.light, ROUND_LIGHT_SURFACE));
  add(desk, still(ROUND_FELT, ROUND_R, ROUND_SURFACE));
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
 * WHERE A PIECE ON THIS DESK MAY GO — the page, inset by the piece's own reach from its middle, with
 * the felt as a TRAP in it (`TrapWalls`): a carry goes anywhere on the page and never off it; a
 * throw on the page bounces off the page's edge and may fly in over the table's rim; a throw on
 * the table bounces off the felt's edge from inside and never leaves it — only a hand takes a card
 * off the table.
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
export function roundWalls(piece: Node): TrapWalls {
  const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
  const size = shape ? extentOf(shape) : { w: 0, h: 0 };
  const reach = Math.hypot(size.w, size.h) / 2;
  const page = Math.max(0, ROUND_PAGE - reach);
  // A piece bigger than the felt has nowhere to stand: the trap collapses to the middle rather than
  // turning inside out, which is what a negative radius would do.
  return { outer: { x0: -page, y0: -page, x1: page, y1: page }, inner: { cx: 0, cy: 0, r: Math.max(0, ROUND_R - reach) } };
}
