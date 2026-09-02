// MECHANICS / MAGNETISM — a zone that takes a card let go of NEAR it, not only ON it.
//
// A drop is decided by a point: the finger comes up somewhere, and whatever container is under that
// somewhere gets the card. That is exact, and it is the wrong kind of exact. A player aiming a card
// at their own area is not aiming at a pixel — they move it over there and let go, and "over there"
// is a place with a size. Miss the zone by the width of the card's own border and the card stays on
// the felt, which reads as the desk refusing a move that was plainly made.
//
// So the zone REACHES (`Reaching`). Everything within that much of its edge is still it, and the
// card goes home. Nothing else about the drop changes: the same `zoneAt` seam, the same accept rule,
// the same re-parent, the same layout squaring the cards up once they are in. The one thing that
// moved is the size of the answer to "where is the zone".
//
// It is deliberately NOT a pull on the carried card. A held thing rides the hand one to one — that
// is a law of this kit, and a card that started drifting towards a zone under the finger would read
// as a dropped frame rather than as attraction. The magnet acts at the moment of release, which is
// also the only moment a player is asking a question of it.

import {
  Acceptor,
  add,
  caps,
  fieldsOf,
  move,
  outlineOf,
  outlinesTouch,
  placedOutline,
  reachOf,
  transformsOf,
  Bounded,
  compose,
  Container,
  Draggable,
  freeLayout,
  Grabber,
  installStockGrabs,
  node,
  Reaching,
  rect,
  registerLayout,
  registerSurface,
  roundedRect,
  rowLayout,
  setFacing,
  Surfaced,
  Transformable,
  type BoundedFields,
  type Node,
  type Vec,
} from "../../src/index.js";
import { cards as crossadeCards } from "@game-presets/cards";
import { installMapArt, MAP, warmingNodes } from "./gestureMap.js";

/** How many cards the deck holds, and where it and the zone stand. */
export const MAGNET = { cards: 36 };

/**
 * How far the zone reaches past its own edge, root units — see `Reaching`.
 *
 * Measured edge to edge, so this is a gap of bare felt between the card and the border and reads as
 * one: a finger's width of forgiveness, not "somewhere in the general direction".
 */
export const PULL = 0.4;

/** The zone's own box, in units — a hand's worth of cards wide, and a card and a half tall. */
const ZONE = { w: 3.4, h: 2 };

const ZONE_SURFACE = "magnet.zone";
const ZONE_LAYOUT = "magnet.hand";
const DESK_LAYOUT = "magnet.free";

/** A piece put down outside the zone stays where it was put — the zone is the only thing that takes. */
const PUT_DOWN = Draggable({ onReject: "stay" });

function installMagnetArt(): void {
  installMapArt();
  // The grab rules are installed here as an ordinary consumer would: unregistered, a `Grabber`
  // names a rule nothing resolves and the container hands back nothing at all.
  installStockGrabs();
  registerLayout(DESK_LAYOUT, freeLayout);
  // A ROW, because what a zone does with what it is given is half of what makes it read as a zone:
  // cards that landed anyhow are cards lying in a rectangle, and cards squared up are a HAND.
  registerLayout(ZONE_LAYOUT, rowLayout({ gap: -0.45, padding: 0.12 }));
  registerSurface(ZONE_SURFACE, {
    layers: [{ paint: "sunkBg" }],
    radius: 0.24,
    // THE BORDER IS THE ZONE. Nothing else on the felt says where it begins, and a zone a player
    // cannot see the edge of is a zone they cannot aim at — which is the very thing the reach is
    // there to forgive.
    stroke: { color: "accent", width: 0.05 },
  });
}

/**
 * THE DESK: a closed deck of thirty-six, and one zone with a border, standing apart from it.
 *
 * Apart on purpose — the whole gesture is carrying a card ACROSS the felt to somewhere, and a zone
 * under the deck would be answered by accident on the first drag. `pull` is the panel's number so a
 * reader can watch the same release land in the zone and on the felt.
 */
export function magnetMap(pull = PULL): Node {
  installMagnetArt();
  const desk = node(
    "map",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: DESK_LAYOUT }),
    Surfaced({ surface: "gesture.map" }),
    // A CONTAINER HAS TO SAY WHAT A TOUCH TAKES OUT OF IT, or a drop is denied before any zone is
    // asked: the move plan starts by asking the SOURCE for its load, and a container with no
    // `Grabber` hands back nothing (`block: "empty"`). "One" is the felt's answer — a finger on a
    // card takes that card, not the pile under it.
    Grabber({ grab: "one" }),
  );
  add(
    desk,
    node(
      "my zone",
      Bounded({ bounds: roundedRect(ZONE.w, ZONE.h, 0.24) }),
      Surfaced({ surface: ZONE_SURFACE }),
      Transformable({ at: { x: 0, y: 1.8 } }),
      Container({ layout: ZONE_LAYOUT }),
      // Everything is welcome: what this desk is about is WHERE the zone is, not what it will take.
      Acceptor({}),
      // ...and the zone answers the same question for whatever is taken back OUT of it again.
      Grabber({ grab: "one" }),
      Reaching({ reach: pull }),
    ),
  );
  crossadeCards()
    .slice(0, MAGNET.cards)
    .forEach((card, i) => {
      compose(card, Transformable({ at: { x: -1.1 + i * 0.004, y: -2.3 - i * 0.012 } }));
      compose(card, PUT_DOWN);
      setFacing(card, "down");
      add(desk, card);
    });
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}


/**
 * THE ZONE A RELEASE BELONGS TO — the one whose REACH the point falls inside, and the nearest of
 * them if a release is near two.
 *
 * The wiring's own answer is "the container under this point" (`DragOptions.zoneAt`), which is exact
 * and exactly wrong for a hand: a player aiming at their area moves the card over there and lets go,
 * and "over there" is a place with a size, not a pixel. This widens the answer by the zone's own
 * reach and changes nothing else — the same accept rule, the same re-parent, the same layout.
 *
 * NEAREST and not first-found, because two zones a card's width apart would otherwise be decided by
 * the order somebody added them to the desk, which is not a thing a player can see or predict.
 */
export function zoneNear(root: Node, at: Vec, lead: Node): Node | undefined {
  const poses = transformsOf(root);
  const shape = fieldsOf<BoundedFields>(lead, "Bounded")?.bounds;
  // THE PIECE'S OWN OUTLINE, put where it was let go of. Measured from its centre instead, half a
  // card of the answer would be the card's own size: a card visibly overlapping the zone would still
  // be "0.7 away", and every reach a reader tried would have that baked into it.
  const piece = shape ? placedOutline(outlineOf(shape), move(at.x, at.y)) : [at];
  let best: Node | undefined;
  let closest = Infinity;
  for (const zone of root.children) {
    if (!caps(zone).has("Acceptor")) continue;
    const box = fieldsOf<BoundedFields>(zone, "Bounded")?.bounds;
    const pose = poses.get(zone.id);
    if (!box || !pose) continue;
    const gap = gapBetween(piece, placedOutline(outlineOf(box), pose));
    if (gap > reachOf(zone) || gap >= closest) continue;
    closest = gap;
    best = zone;
  }
  return best;
}

/**
 * HOW FAR APART TWO OUTLINES ARE, root units — `0` for two that meet.
 *
 * Exact for convex outlines, which is what everything the kit builds gives: when two convex shapes
 * are apart, the nearest pair of points is always a vertex of one against an edge of the other, so
 * checking both ways round finds it. Overlapping, there is no distance to have and the answer is
 * nothing at all — a piece already on the zone is at the zone, and the reach is what it forgives
 * beyond that, never something it demands.
 */
function gapBetween(a: readonly Vec[], b: readonly Vec[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  if (outlinesTouch(a, b, 0)) return 0;
  let near = Infinity;
  for (const [one, other] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const p of one) {
      for (let i = 0, j = other.length - 1; i < other.length; j = i++) near = Math.min(near, toEdge(other[j]!, other[i]!, p));
    }
  }
  return near;
}

/** The distance from a point to a segment — the projection, clamped to the segment's own ends. */
function toEdge(a: Vec, b: Vec, p: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
