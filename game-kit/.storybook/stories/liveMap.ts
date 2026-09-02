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
// The two screens are two SCENES, not one drawn twice. Two hosts, two clocks, two cameras — because
// that is what two devices are, and a page that faked it with one would be quietly proving nothing.

import {
  Acceptor,
  add,
  Bounded,
  byId,
  circle,
  cloneTree,
  freeLayout,
  registerLayout,
  Coated,
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
  Valued,
  setFacing,
  Surfaced,
  Transformable,
  fieldsOf,
  type Node,
  type NodeId,
  type ValuedFields,
  type Vec,
} from "../../src/index.js";
import { cards as crossadeCards } from "@game-presets/cards";
import { installMapArt, MAP, warmingNodes } from "./gestureMap.js";
import { handLayout, PULL, ZONE_SPREAD, type Spread } from "./magnetMap.js";

/** The two seats this page seats, and the colour each is drawn in. */
export const SEATS = [
  { seat: "south", ink: "accent" },
  { seat: "north", ink: "alert" },
] as const;

/** What is on the shared desk. */
export const LIVE = { cards: 36 };

const ZONE = { w: 3.6, h: 1.9 };
const ZONE_SURFACE = "live.zone";
const ZONE_LAYOUT = "live.hand";
const DESK_LAYOUT = "live.free";
const CURSOR = "live.cursor";

/** Where each seat's own area stands — across the desk from each other, as two players sit. */
const AREA: Record<string, number> = { south: 2.1, north: -2.1 };

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
  // A CURSOR IS A DISC AND NOTHING ELSE. It is a picture of somebody's finger, not a piece: it takes
  // no room, answers no touch, and is coloured by whose it is (`Coated`, tinted per seat) rather
  // than by what it is — which is why one surface serves both seats.
  registerSurface(CURSOR, { layers: [{ paint: "text" }] });
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

/** How big another hand's cursor is drawn, in units — a fingertip, not a piece. */
const CURSOR_SIZE = 0.34;

/**
 * THE SNAPSHOT, MARKED WITH WHOEVER ELSE'S HANDS ARE ON THE DESK.
 *
 * A COPY, because marks come off as well as on: a ring composed onto the snapshot itself would
 * outlive the hand that put it there — the next pass simply does not mention that node, and what
 * was never removed stays. Marking a fresh tree each time makes absence mean absence.
 *
 * Two marks, and they say two different things. The RING says "somebody else is holding this", which
 * is about a card. The CURSOR says "somebody else's finger is here", which is about a person and is
 * drawn even when they are holding nothing at all — a hand you cannot see is a player who has left.
 */
export function markHands(snapshot: Node, hands: ReadonlyMap<string, Hand>): Node {
  const seen = cloneTree(snapshot);
  for (const [who, hand] of hands) {
    const ink = SEATS.find((s) => s.seat === who)?.ink ?? "text";
    for (const id of hand.els) {
      const held = byId(seen, id);
      if (held) compose(held, Coated({ self: { recipe: "ring", level: 1, tint: ink } }));
    }
    if (!hand.at) continue;
    add(
      seen,
      node(
        `cursor ${who}` as NodeId,
        Bounded({ bounds: circle(CURSOR_SIZE / 2) }),
        Surfaced({ surface: CURSOR }),
        Coated({ self: { recipe: "wash", level: 1, tint: ink } }),
        // IT SAYS WHAT IT IS. Its name is a name, and nothing may read one (`guard.id-is-opaque`):
        // a screen asking "which of these is a cursor" asks the node, not the string.
        Valued({ values: { cursor: 1 } }),
        Transformable({ at: hand.at, z: 9 }),
      ),
    );
  }
  return seen;
}

/** A picture of somebody's finger, told apart from a piece by what it carries and never by its name. */
export const isCursor = (n: Node): boolean => fieldsOf<ValuedFields>(n, "Valued")?.values?.["cursor"] !== undefined;

/** One other hand, as this screen knows it: whose it is, what it holds, and where it is. */
export interface Hand {
  readonly els: readonly NodeId[];
  readonly at?: Vec;
}
