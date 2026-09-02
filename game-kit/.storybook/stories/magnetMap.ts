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
  byId,
  extentOf,
  heapOf,
  Heaping,
  overlapFraction,
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
  setFacing,
  Surfaced,
  Transformable,
  type BoundedFields,
  type LayoutChild,
  type LayoutRecord,
  type Node,
  type Point,
  type Shape,
  type TransformableFields,
  type Vec,
} from "../../src/index.js";
import { cards as crossadeCards } from "@game-presets/cards";
import { GRIP_GAP, GRIP_RATIO, installMapArt, isGrip, MAP, warmingNodes, type HeapRule } from "./gestureMap.js";

/** How many cards the deck holds, and where it and the zone stand. */
export const MAGNET = { cards: 36 };

/**
 * HOW MUCH OF A CARD MUST LIE INSIDE THE ZONE BEFORE THE ZONE COUNTS IT, 0..1.
 *
 * Its own number, and not the pull. The pull is about a MOMENT — the instant a hand lets go, and how
 * generous the desk is about where. This is about a STATE, asked of everything on the felt whenever
 * anything moves: is this card in my area? A card can be in the zone without ever having been
 * dropped into it — pushed there, knocked there, left half over the edge — and the zone's handle has
 * to take it just the same, because a player looking at the desk would call it theirs.
 */
export const HELD_SHARE = 0.15;

/** How much two CARDS must overlap before they are one heap on the felt, 0..1. */
export const CARD_SHARE = 0.1;

/**
 * WHAT A HAND LOOKS LIKE, in the air and in the zone.
 *
 * The fan is allowed to be WIDE — up to the whole desk if it has to be — because a hand held out is
 * a thing you are meant to read, and one that stayed the width of the zone it came from would be a
 * squashed row held at an angle. The row is bounded by its zone and closes up instead.
 */
export const FAN_SPREAD: Spread = { gapMin: 0.18, gapMax: 0.62, wideMin: 0.24, wideMax: 1 };
export const ZONE_SPREAD: Spread = { gapMin: 0.08, gapMax: 0.55, wideMin: 0, wideMax: 1 };

/** How far the outermost card of a fan leans, degrees. `0` is a straight line of upright cards. */
export const FAN_TILT = 26;

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

/** Felt left between the outermost card and the zone's border, in units. */
const ZONE_PAD = 0.12;

function installMagnetArt(zone: Spread): void {
  installMapArt();
  // The grab rules are installed here as an ordinary consumer would: unregistered, a `Grabber`
  // names a rule nothing resolves and the container hands back nothing at all.
  installStockGrabs();
  registerLayout(DESK_LAYOUT, freeLayout);
  registerLayout(ZONE_LAYOUT, handLayout(zone, ZONE_PAD));
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
export function magnetMap(pull = PULL, zone: Spread = ZONE_SPREAD): Node {
  installMagnetArt(zone);
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
      // A CARD HEAPS WITH A CARD, and has to be COVERED to do it — no reach, which is what a hand of
      // cards means by a pile (`Reaching`).
      compose(card, Heaping({ heap: "card" }));
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
  // A HANDLE IS NOT A PIECE AND IS NEVER PUT ANYWHERE. It is a picture of a heap, redrawn wherever
  // that heap ends up; a zone that took one would be given a control to keep, and the row would lay
  // the tab out among the cards as though it were one of them. Which is exactly what it did.
  //
  // Nothing is lost by refusing: the cards the handle was carrying come down over the zone, and the
  // zone counts them the moment anything moves, because being in a zone is a matter of lying in it
  // (`zoneHolds`) and never of having been handed over.
  if (isGrip(lead)) return undefined;
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


/**
 * A HAND LAID OUT IN A ROW, by the same four numbers the fan uses — and it is the same question:
 * how far apart may these cards be, and how wide may the lot of them get.
 *
 * What differs is the room. A hand in the air is bounded by the desk; a hand lying in a zone is
 * bounded by the zone, and that bound is HARD — a row that outgrew its border would read as the
 * zone having failed to hold what it was given. Given no box the layout places nobody: inventing an
 * edge is worse than saying there is none, which is the same silence a free canvas gives.
 */
export function handLayout(look: Spread, padding = 0): LayoutRecord {
  const place = (children: readonly LayoutChild[], box?: Shape): readonly (Point | undefined)[] => {
    if (!box) return children.map(() => undefined);
    const widest = children.reduce((w, c) => Math.max(w, c.footprint ? extentOf(c.footprint).w : 0), 0);
    // The room a card's own CENTRE may stand in: the box, less the padding, less the card itself.
    const room = Math.max(0, extentOf(box).w - 2 * padding - widest);
    const step = fitStep(children.length, room, look);
    const from = -(step * (children.length - 1)) / 2;
    return children.map((_child, i) => ({ x: from + step * i, y: 0 }));
  };
  // NO ADDRESSES. A hand is not a set of slots: a card given to it JOINS it, and where it ends up
  // is a consequence of how many there are rather than of where the finger was. `indexAt` is
  // optional for exactly this — a layout with no seats to point at says so by not answering.
  return { padding, place };
}

/**
 * WHAT THE ZONE IS HOLDING — its own children, and anything else lying far enough inside it.
 *
 * Parentage alone is not the answer. A card put down by a hand belongs to the zone by having been
 * given to it, and that is the ordinary way in; but a card can end up in somebody's area without
 * anybody handing it over — pushed there, knocked there, left half across the border — and a zone
 * that only counted what it had been given would leave those on the felt while a player looking at
 * the desk would call them theirs.
 *
 * So the state is asked of the geometry, every time anything moves, with the same share the merging
 * desk asks of two cards: how much of THIS piece is inside that box.
 */
export function zoneHolds(share: number): NonNullable<HeapRule["held"]> {
  return (root, aloft) => {
    const poses = transformsOf(root);
    const out: { under: Node; pieces: Node[] }[] = [];
    for (const zone of root.children) {
      if (!caps(zone).has("Acceptor")) continue;
      const box = fieldsOf<BoundedFields>(zone, "Bounded")?.bounds;
      const pose = poses.get(zone.id);
      if (!box || !pose) continue;
      const area = placedOutline(outlineOf(box), pose);
      // ITS OWN CHILDREN ALWAYS. They were given to it, and where a layout has since put them is the
      // zone's business — a card the zone itself pushed to the edge of its own row is still in it.
      const pieces = zone.children.filter((n) => !aloft(n.id));
      for (const loose of root.children) {
        if (aloft(loose.id) || !heapOf(loose)) continue;
        const shape = fieldsOf<BoundedFields>(loose, "Bounded")?.bounds;
        const at = poses.get(loose.id);
        if (!shape || !at) continue;
        if (overlapFraction(placedOutline(outlineOf(shape), at), area) >= share) pieces.push(loose);
      }
      out.push({ under: zone, pieces });
    }
    return out;
  };
}


/**
 * WHAT A SPREAD OF CARDS IS ALLOWED TO BE — the same four numbers for a hand in the air and a hand
 * lying in its zone, because it is the same question asked in two places.
 *
 * TWO BOUNDS ON THE STEP and two on the WHOLE. A step alone cannot say "a hand of twenty may be
 * wider than a hand of three but not wider than the desk"; a width alone cannot say "two cards must
 * not sit a hand's length apart just because there is room". Neither is derivable from the other,
 * and every card game anybody has played has an opinion about both.
 *
 * The widths are FRACTIONS of the room the spread lives in — the desk for a hand in the air, the
 * zone's own box for one lying in it — so the numbers mean the same thing on either side and survive
 * a change of size on either.
 */
export interface Spread {
  /** Units between neighbouring card centres: the closest they may ever be, and the furthest. */
  readonly gapMin: number;
  readonly gapMax: number;
  /** The whole spread's width, as a fraction of the room it is in. */
  readonly wideMin: number;
  readonly wideMax: number;
}

/**
 * THE STEP THIS MANY CARDS ACTUALLY TAKE, in units.
 *
 * With a stated order, because the four bounds can contradict each other and something has to lose.
 * The line between them is what a bound is FOR:
 *
 *   CEILINGS ARE ABOUT NOT OVERFLOWING, and they always win. The room is one — a spread never leaves
 *   the place it is in, which is not a preference but what an edge means — and the width ceiling is
 *   the same kind of statement about a smaller box the reader drew inside it.
 *   FLOORS ARE ABOUT COMFORT: cards no closer than this, a hand no narrower than that. They lift the
 *   step when there is headroom and give way the moment a ceiling disagrees.
 *   THE COMFORTABLE STEP sits between them, taken whenever nothing else has an opinion.
 */
export function fitStep(count: number, room: number, look: Spread): number {
  if (count < 2) return 0;
  const gaps = count - 1;
  const hard = Math.min(room / gaps, (room * look.wideMax) / gaps);
  const want = Math.min(look.gapMax, hard);
  const floor = Math.max(look.gapMin, (room * look.wideMin) / gaps);
  return Math.min(hard, Math.max(want, floor));
}

/**
 * A HAND SPLAYED — laid out by its WIDTH, and turned to match.
 *
 * The width is the thing a reader has an opinion about ("a hand may take the whole desk if it has
 * to"), so it is the width the numbers control and the angles that follow: each card stands at the
 * x its share of the spread gives it, and its turn is the angle that x sits at on the arc. The arc
 * itself is derived from the two — the radius is whatever makes the outermost card lean by `tilt` —
 * so a wide hand is a shallow sweep and a narrow one is a steep one, which is what a hand does.
 *
 * The middle card sits exactly where the squared stack would have put it, so a hand opening and
 * closing does not also drift up or down the finger.
 */
export function zoneFan(look: Spread, tilt: number) {
  return (group: readonly Node[], gripW: number): { at: Vec; deg: number }[] => {
    const step = fitStep(group.length, MAP.w, look);
    const half = (step * Math.max(0, group.length - 1)) / 2;
    // The radius that makes the OUTERMOST card lean by exactly `tilt`. No tilt asked for, no arc:
    // the hand is a straight line of upright cards, which is a legitimate thing to want to see.
    const arc = tilt > 0 && half > 0 ? half / Math.sin((tilt * Math.PI) / 180) : 0;
    return group.map((piece, i) => {
      const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
      const hangs = gripW / GRIP_RATIO / 2 + GRIP_GAP + (shape ? extentOf(shape).h / 2 : 0);
      const x = -half + step * i;
      const a = arc > 0 ? Math.asin(Math.max(-1, Math.min(1, x / arc))) : 0;
      // The dip: a card out at the end of the sweep hangs a little lower than the one in the middle,
      // which is the whole difference between a fan and a row of cards at angles.
      return { at: { x: x || 0, y: -hangs + (arc > 0 ? arc * (1 - Math.cos(a)) : 0) || 0 }, deg: (a * 180) / Math.PI };
    });
  };
}

/**
 * A PLACE RE-POSES WHAT IT HAS — everything a zone holds goes flat again once it is put down.
 *
 * A drop leaves pieces as they were, fan and all; that is what a drop IS, and a fan let go of on the
 * felt stays a fan. A place is the exception, because how its things lie is its own business: the
 * row it lays them out in has no opinion about turns (no layout here has), so the turn a lift put on
 * them has to be taken off by the desk that put it there.
 *
 * BY THE SAME TEST THE HANDLE USES, not by parentage. A hand let go of over its own zone is never
 * handed to it — a run led by a handle is led by a control, and a zone takes cards, not controls
 * (`zoneNear`) — so the cards come down ON the zone and the zone counts them by lying in it. Asked
 * about children only, this straightened exactly the cards that had been dealt in one at a time and
 * left every hand ever put back looking like a fan dropped in a box.
 */
export function zoneSquares(share: number): NonNullable<HeapRule["settled"]> {
  return (root, ids) => {
    const held = new Set(zoneHolds(share)(root, () => false).flatMap(({ pieces }) => pieces.map((n) => n.id)));
    for (const id of ids) {
      const piece = byId(root, id);
      if (!piece || !held.has(id)) continue;
      const own = fieldsOf<TransformableFields>(piece, "Transformable");
      compose(piece, Transformable({ ...(own ?? {}), angle: 0 }));
    }
  };
}


/**
 * THE PANEL'S NUMBERS, WRITTEN INTO A DESK THAT IS ALREADY STANDING — see `HeapRule.tune`.
 *
 * Two of them do not live in the rule at all: the zone's REACH is a field on the zone, and the row
 * the zone lays its cards out in is a registered arrangement the zone names. Both are set when the
 * desk is built, and a desk is built once — so without this, those two knobs would take effect only
 * on a page reload, which is exactly the kind of control that teaches a reader the wrong thing.
 */
export function magnetTune(pull: number, zone: Spread) {
  return (root: Node): void => {
    installMagnetArt(zone);
    for (const node of root.children) {
      if (caps(node).has("Acceptor")) compose(node, Reaching({ reach: pull }));
    }
  };
}
