// MECHANICS / MAGNETISM, LIVE — one desk, two screens, and neither of them is the truth.
//
// Everything the magnetism page does, with the one difference that decides whether any of it was
// really built: the board is somewhere else. A drop resolved on one screen alone would be real for
// one pair of eyes and would never have happened for the other, so a finger PROPOSES and the shared
// board is what moves. That the same mechanic survives that is the whole claim.
//
// NO VISIBILITY RULES HERE. Every seat sees every card, face and all. Hiding is a real thing and the
// kit does it (`project`), but it is a second subject, and a page teaching two at once teaches
// neither: with cards hidden, a reader watching one screen cannot tell "the other player has not
// moved" from "the other player moved something I am not allowed to see".
//
// The two screens are two SCENES over ONE tree, which is what two people at one board are. A cursor
// is drawn over the GLASS and never on the felt: a piece is what anything on the felt would be —
// touchable, heapable, and in everybody's way — and a picture of somebody's finger is none of those.

import {
  Acceptor,
  add,
  caps,
  Bounded,
  freeLayout,
  registerLayout,
  compose,
  Container,
  Draggable,
  Grabber,
  Heaping,
  installStockGrabs,
  node,
  Reaching,
  rect,
  registerSurface,
  roundedRect,
  setFacing,
  Surfaced,
  Transformable,
  type Node,
  type Vec,
} from "../../src/index.js";
import { cards as crossadeCards } from "@game-presets/cards";
import { installMapArt, MAP, warmingNodes } from "./gestureMap.js";
import { handLayout, PULL, ZONE_SPREAD, type Spread } from "./magnetMap.js";

/**
 * WHAT ONE UNIT IS WORTH ON A LIVE PANE, in pixels.
 *
 * Smaller than the house etalon on purpose: that one is sized for a single scene filling a page, and
 * this page stacks two. At the house size each pane shows a crop, and the two areas a reader is
 * meant to aim BETWEEN sit off the glass — which makes the common ground unreachable rather than
 * merely small.
 */
export const LIVE_UNIT = 56;

/** The two seats this page seats, and the colour each is drawn in. */
export const SEATS = [
  { seat: "south", ink: "accent" },
  { seat: "north", ink: "alert" },
] as const;

/** What is on the shared desk. */
export const LIVE = { cards: 36 };

const ZONE = { w: 3.4, h: 1.4 };
const ZONE_SURFACE = "live.zone";
const ZONE_LAYOUT = "live.hand";
const DESK_LAYOUT = "live.free";

/**
 * WHERE EACH SEAT'S OWN AREA STANDS — and how much felt is left between them.
 *
 * The gap is the point. Two areas near each other are two magnets near each other: a card pulled
 * out of one is inside the other's reach before it is anywhere, so there is nowhere on the desk to
 * simply PUT something down. The common ground between them has to be big enough to be a place.
 */
const AREA: Record<string, number> = { south: 2.05, north: -2.05 };

/** A piece put down outside a zone stays where it was put. */
const PUT_DOWN = Draggable({ onReject: "stay" });

export function installLiveArt(zone: Spread): void {
  installMapArt();
  installStockGrabs();
  registerLayout(DESK_LAYOUT, freeLayout);
  registerLayout(ZONE_LAYOUT, handLayout(zone, 0.12));
  registerSurface(ZONE_SURFACE, {
    layers: [{ paint: "sunkBg" }],
    radius: 0.22,
    stroke: { color: "panelBorder", width: 0.04 },
  });
}

/**
 * THE SHARED DESK: a deck and one area per seat. Plain magnetism — a card let go of near an area
 * goes into it, and every seat may reach every area, because whose turn it is and what may go where
 * are a game's rules and this page has none.
 */
export function liveMap(pull = PULL, zone: Spread = ZONE_SPREAD): Node {
  installLiveArt(zone);
  const desk = node(
    "desk",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: DESK_LAYOUT }),
    Surfaced({ surface: "gesture.map" }),
    Grabber({ grab: "one" }),
  );
  for (const { seat } of SEATS) {
    add(
      desk,
      node(
        `${seat} area`,
        Bounded({ bounds: roundedRect(ZONE.w, ZONE.h, 0.22) }),
        Surfaced({ surface: ZONE_SURFACE }),
        Transformable({ at: { x: 0, y: AREA[seat]! } }),
        Container({ layout: ZONE_LAYOUT }),
        Acceptor({}),
        Grabber({ grab: "one" }),
        Reaching({ reach: pull }),
      ),
    );
  }
  crossadeCards()
    .slice(0, LIVE.cards)
    .forEach((card, i) => {
      compose(card, Transformable({ at: { x: -1.2 + i * 0.004, y: -0.1 - i * 0.012 } }));
      compose(card, PUT_DOWN);
      compose(card, Heaping({ heap: "card" }));
      setFacing(card, "up");
      add(desk, card);
    });
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}

/**
 * THE PANEL'S NUMBERS, WRITTEN INTO A DESK THAT IS ALREADY STANDING — see `HeapRule.tune`.
 *
 * The same two that the magnetism desk has to re-apply, for the same reason: an area's REACH is a
 * field on the area, and the row it lays its cards out in is a registered arrangement it names by
 * name. Both are set when the desk is built, and a desk is built once.
 */
export function liveTune(pull: number, zone: Spread) {
  return (root: Node): void => {
    installLiveArt(zone);
    for (const one of root.children) {
      if (caps(one).has("Acceptor")) compose(one, Reaching({ reach: pull }));
    }
  };
}
