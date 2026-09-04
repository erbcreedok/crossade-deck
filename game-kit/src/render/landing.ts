import { add, byId, compose, fieldsOf, node, remove, type Node } from "../core/node.js";
import { extentOf, Bounded, type BoundedFields } from "../core/atoms/bounded.js";
import { Transformable, type TransformableFields } from "../core/atoms/transformable.js";
import { Private } from "../core/atoms/private.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Valued } from "../core/atoms/valued.js";
import { apply, type Vec } from "../core/transform.js";

 // Wait, is isDrawn used? No, only in handOver which we are not moving. Wait, zoneFor uses isDrawn? No, zoneFor doesn't.
import { type CarryItem, type CarryOptions, type Motions } from "./animator/index.js";
import { bumped, dropOf, restsAt, type Bump, type LetGo } from "./fall.js";
import { type Host } from "./host.js";

// Keep MARK_SURFACE and MARK_UNDER
export const MARK_SURFACE = "gesture.map.mark";
const MARK_UNDER = -1000;

import { type PathSegment, type Shape } from "../core/atoms/bounded.js";

const KAPPA = 0.552284749831;
function rect(w: number, h: number): Shape {
  const x = w / 2;
  const y = h / 2;
  // A SHAPE STARTS SOMEWHERE. `start` is where the outline is entered before the first segment,
  // and a shape without one has no first point: the outline walk reads `undefined.x` and the whole
  // plan dies on the first frame the mark is drawn. Copied without it once; never again.
  return {
    start: { x: -x, y: -y },
    segments: [{ to: { x, y: -y } }, { to: { x, y } }, { to: { x: -x, y } }, { to: { x: -x, y: -y } }],
  };
}
function roundedRect(w: number, h: number, radius: number): Shape {
  const r = Math.min(radius, Math.min(w, h) / 2);
  if (r <= 0) return rect(w, h);
  const x = w / 2;
  const y = h / 2;
  const k = r * KAPPA;
  const segments: PathSegment[] = [
    { to: { x: x - r, y: -y } },
    { c1: { x: x - r + k, y: -y }, c2: { x, y: -y + r - k }, to: { x, y: -y + r } },
    { to: { x, y: y - r } },
    { c1: { x, y: y - r + k }, c2: { x: x - r + k, y }, to: { x: x - r, y } },
    { to: { x: -x + r, y } },
    { c1: { x: -x + r - k, y }, c2: { x: -x, y: y - r + k }, to: { x: -x, y: y - r } },
    { to: { x: -x, y: -y + r } },
    { c1: { x: -x, y: -y + r - k }, c2: { x: -x + r - k, y: -y }, to: { x: -x + r, y: -y } },
  ];
  return { start: { x: -x + r, y: -y }, segments };
}


/** What a carry FEELS like — everything the clock was told about it bar where and inside what. */
export type CarryFeel = Omit<CarryOptions, "anchor" | "walls" | "onWall" | "onSnap">;

/**
 * WHAT HAD TO BE FIXED was a load standing ON the answer and hiding it. It does not hide it any
 * more: the picture is drawn UNDER what is being carried, so the whole outline reads however far the
 * load leans over it, and this number is now only about how a held thing should sit in a hand.
 */
export const CARRY_CLEAR = 0.32;

/**
 * IT RIDES THE CARRY AND IS NEVER WRITTEN. Given to the hand as one more thing being carried — with
 * no lift, so it stays on the felt, and at the seat the run's first card will take — it follows the
 * finger for free, every frame, without a single write to the tree while the hand is moving.
 */
export function landingMark(at: Vec, box: { readonly w: number; readonly h: number }, nth: number, seat?: string): Node {
  return node(
    `landing mark ${nth}`,
    Bounded({ bounds: roundedRect(box.w, box.h, Math.min(box.w, box.h) * 0.08) }),
    // WHOSE PICTURE IT IS. A seat that is known opens the mark to that seat alone; a desk with no
    // seats (a single-screen story) leaves it open, because there is nobody to hide it from.
    ...(seat ? [Private({ access: [seat] })] : []),
    Surfaced({ surface: MARK_SURFACE }),
    // UNDER WHAT IS BEING CARRIED. The picture and the load are drawn together — both ride the hand,
    // so the plan puts them in the same rank and the order inside it is the z. Left at the desk's
    // own, the mark is the newest child and lands on TOP of the very cards it is a picture for, and
    // a hand of thirty-six is read through a cage. Below them it is a shape on the felt, which is
    // what it is: the load leans over it and the outline still reads all the way round.
    Transformable({ at, z: MARK_UNDER }),
    Valued({ values: { mark: nth } }),
  );
}

/**
 * WHERE THE PICTURE OF THE LANDING STANDS — under the anchor, or IN the zone that would take it.
 *
 * The picture is of the PLACE, and when a zone would take this run the place is the zone: a zone
 * lays its own things out in its own arrangement, so where these cards will lie there is the zone's
 * business and not the felt's. Aim at somebody's area and the picture moves into it — the answer
 * before the hand has let go, and given by the very question that lights the zone, so the light and
 * the picture can never say two different things.
 *
 * IT KEEPS ITS OWN SIZE either way. Grown to the zone's outline it would trace the border the zone
 * already draws — a second line on the first, saying nothing the first did not. What has news in it
 * is the same thing as always: the shape of what will be lying there.
 */
export function landingAt(anchor: Vec, seat: Vec, zone: Node | undefined): Vec {
  const home = zone ? fieldsOf<TransformableFields>(zone, "Transformable")?.at : undefined;
  return home ?? { x: anchor.x + seat.x, y: anchor.y + seat.y };
}

export function landingBox(
  run: readonly Node[],
  seats: readonly Vec[],
): { readonly at: Vec; readonly w: number; readonly h: number } {
  const shape = run[0] ? fieldsOf<BoundedFields>(run[0], "Bounded")?.bounds : undefined;
  const own = shape ? extentOf(shape) : { w: 1, h: 1.4 };
  const xs = seats.map((seat) => seat.x);
  const ys = seats.map((seat) => seat.y);
  const x0 = Math.min(...xs) - own.w / 2;
  const x1 = Math.max(...xs) + own.w / 2;
  const y0 = Math.min(...ys) - own.h / 2;
  const y1 = Math.max(...ys) + own.h / 2;
  return { at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, w: x1 - x0, h: y1 - y0 };
}

/**
 * THE ZONE THIS RELEASE BELONGS TO — asked about the run's first PIECE, never about its handle.
 *
 * A run led by a handle is led by a control, and a zone takes cards and not controls: asked about
 * the tab, every hand ever carried over a zone is refused, and the cards come down on top of it
 * instead of into it.
 */
export function zoneFor(
  s: { readonly host: Host; readonly motions?: Motions },
  items: readonly CarryItem[],
  zones: ((root: Node, at: Vec, lead: Node) => Node | undefined) | undefined,
  aim: Vec | undefined,
): Node | undefined {
  if (!zones) return undefined;
  // THE RUN'S ANCHOR, which is its handle when it has one and the piece itself when it has not — and
  // it is `items[0]` either way, because that is how a run is assembled (`runOf`: `[hit, ...run]`).
  //
  // A card was asked before, and that made the answer depend on which card the fan happened to put
  // nearest the zone: a hand splayed across the felt reaches into an area its owner never aimed at,
  // and a stack let go of at the edge went in because one corner of one card did. What a hand aims
  // is the thing it is holding.
  const it = items[0];
  const lead = it ? byId(s.host.root, it.id) : undefined;
  const drawn = it ? s.motions?.poses()?.get(it.id) : undefined;
  return drawn && lead ? zones(s.host.root, aim ?? apply(drawn, { x: 0, y: 0 }), lead) : undefined;
}

/** Where the lead of this release will come to rest — the point a zone should be asked about. */
export function aimOf(
  s: { readonly host: Host; readonly motions?: Motions },
  items: readonly CarryItem[],
  hand: Vec | undefined,
  ways: { card?: LetGo; chip?: LetGo; die?: LetGo },
  bump: Bump | undefined,
): Vec | undefined {
  const it = items[0];
  const lead = it ? byId(s.host.root, it.id) : undefined;
  const drawn = it ? s.motions?.poses()?.get(it.id) : undefined;
  if (!lead || !drawn) return undefined;
  const from = apply(drawn, { x: 0, y: 0 });
  return restsAt(from, hand, bumped(dropOf(lead, ways), lead, bump), s.motions?.tuning().friction ?? 0);
}

/**
 * TO BLINK IS TO HIDE AND SHOW AGAIN — and the picture was hiding because it is not drawn when
 * the hand is throwing. The problem is a hand that is barely throwing at all. A hand slowing down
 * drops below the threshold and is not throwing; the picture comes back; and a microsecond later
 * the finger jitters, the speed spikes, the threshold is crossed, the hand is throwing again, the
 * picture hides. Thirty frames of that is a flicker.
 *
 * HYSTERESIS stops it. A hand that crossed the threshold and threw the picture off the desk is
 * judged throwing still until it drops below HALF the threshold; and the flicker, which is about
 * noise right at the boundary, stays between the two and never crosses either. A throw takes the
 * picture OFF THE DESK for good, because hiding was implemented as ending the gesture's picture —
 * a hand that sped up for a moment and then set the card down carefully saw no picture at all,
 * and the next carry looked "broken" for the same reason. So: the hand is throwing from the
 * moment it would fly, and is not throwing again only once it has slowed to half the threshold.
 */
export function throwGate(wouldFly: (v?: Vec) => boolean, restBelow: number): (v?: Vec) => boolean {
  let flying = false;
  return (v?: Vec) => {
    if (wouldFly(v)) flying = true;
    else if (!v || Math.hypot(v.x, v.y) < restBelow) flying = false;
    return flying;
  };
}

export function landingPicture(
  scene: { readonly host: Host; readonly motions?: Motions },
  opts: { shown: boolean; onChange?: () => void }
) {
  let landing: { readonly node: Node; readonly seat: Vec; readonly hover: Vec; readonly w: number; readonly h: number } | undefined;
  let parked: Node | undefined;
  let hidden = false;
  let marksDrawn = 0;

  /**
   * PUT THE SILHOUETTE ON THE FELT for a run that is being lifted — the shape of what will BE there,
   * standing where the anchor will leave it.
   *
   * `seats` are the run's own landing seats in the anchor's frame, so the picture is drawn from the
   * very arithmetic the landing will use: the outline is those seats swept by one piece's box, and
   * its middle is offset from the anchor by whatever that sweep works out to.
   */
  const mark = (run: readonly Node[], seats: readonly Vec[], anchorAt: Vec): Node | undefined => {
    if (!opts.shown || run.length === 0) return undefined;
    const box = landingBox(run, seats);
    // FOR THIS PAIR OF EYES. The picture is scenery for the hand that is carrying, and the other
    // player has no use for where somebody else's card might come down — a second outline gliding
    // about their desk is noise at best and, mirrored a frame late, a lie. So the mark is opened to
    // its own seat only, and a screen that knows whose it is draws nothing for anyone else.
    //
    // NO HOVER OFFSETS. The silhouette is drawn on the desk, not in the hand, and it represents
    // where the cards will land, which is exactly the point they were lifted from (`anchorAt`):
    // add `hover` to that and the shape jumps up to trace the bottom of the held cards instead of
    // tracing the desk. A card lifted straight up comes straight down, and a silhouette that moved
    // means it won't.
    const markNode = landingMark({ x: anchorAt.x + box.at.x, y: anchorAt.y + box.at.y }, box, marksDrawn++, scene.host.viewer().marks?.me);
    // ...AND HOW TO HIDE IT, which is the rest of the picture. The offset is the difference between
    // the hand's anchor and the middle of the mark (`box.at`); the hover is the hand's own height.
    // Taken together, they are the vector from the mark to the hand. And that is what a carry needs
    // to keep the picture on the felt while the hand moves above it.
    //
    // The box is what the picture was drawn with, kept so the carry can know how wide the thing is
    // without reading the tree it is holding. (It used to ask the mark's bounds, which are the same,
    // but the tree cannot be asked questions while it is being written.)
    landing = { node: markNode, seat: box.at, hover: { x: 0, y: -box.h * CARRY_CLEAR }, w: box.w, h: box.h };
    add(scene.host.root, markNode);
    // ...AND EVERY OTHER SCREEN IS TOLD TOO. One tree, several hosts: a node added here is in the
    // board everybody is reading, and a host is only ever told by being TOLD. Left out, the far
    // screen draws a desk that is genuinely missing something this one has — two people looking at
    // one board and seeing different pictures, which is the one thing a shared desk may not do.
    scene.host.setRoot(scene.host.root);
    opts.onChange?.();
    return markNode;
  };

  /**
   * TAKE THE PICTURE OFF THE DESK WITHOUT FORGETTING IT — the hand is throwing, and a throw has no
   * landing to show. The mark survives (`landing` keeps it) so a hand that slows down again gets
   * the same picture back, in the same gesture; only `showLanding(undefined)` ends it for good.
   */
  const hide = (): void => {
    if (!landing || !landing.node.parent) return;
    remove(landing.node.parent, landing.node);
    scene.motions?.release(landing.node.id);
    parked = undefined;
    hidden = true;
    scene.host.setRoot(scene.host.root);
    opts.onChange?.();
  };

  const show = (at: Vec | undefined, zone: Node | undefined, feel: CarryFeel, carried: readonly CarryItem[]): void => {
    // ...AND BACK ON THE DESK, if a throw that did not happen took it off — and back onto the HAND,
    // which is the part that was missed once: hiding released the mark, and a mark put back into
    // the tree and not re-grabbed stands wherever the tree last had it, which is where the card was
    // lifted from. A picture of the landing pinned to the lift-off point is the wrong picture, and
    // the "nothing changed" shortcut below must not be allowed to keep it there.
    const back = hidden && at !== undefined;
    if (back && landing) {
      add(scene.host.root, landing.node);
      hidden = false;
      opts.onChange?.();
    }
    if (!at) {
      if (landing && landing.node.parent) remove(landing.node.parent, landing.node);
      landing = undefined;
      parked = undefined;
      hidden = false;
      scene.host.setRoot(scene.host.root);
      opts.onChange?.();
      return;
    }
    if (!landing) return;
    // THE PICTURE IS OF THE PLACE, and when a zone would take this run the place is the ZONE: a zone
    // lays its own things out in its own arrangement, so where these cards will lie there is the
    // zone's business and not the felt's. Aim at somebody's area and the picture moves into it,
    // which is the answer before the hand has let go.
    //
    // AND IT IS WRITTEN ONLY WHEN THAT ANSWER CHANGES. On the felt the picture is CARRIED — it rides
    // the hand's own springs and costs the desk nothing per frame. In a zone it does not move at
    // all: a zone does not follow a finger about. So the moments anything is written are a handful
    // per gesture instead of the sixty a second a moving finger asks for, which is what hung the
    // desk: every one of those was a whole desk laid out, planned and painted again.
    if (zone === parked && !back) return;
    if (zone) {
      const own = fieldsOf<TransformableFields>(landing.node, "Transformable");
      compose(landing.node, Transformable({ ...(own ?? {}), at: landingAt(at, landing.seat, zone) }));
      scene.motions?.release(landing.node.id);
      parked = zone;
      scene.host.setRoot(scene.host.root);
      return;
    }
    // ...AND BACK ONTO THE HAND when the aim leaves. The whole run is re-seeded, which is a thing to
    // do a few times in a gesture and never per frame: begun again on every move, a carry never gets
    // past its own first frame — the springs are re-seeded at the anchor, the run stops trailing,
    // and a heap of thirty-six spends every frame building records to throw away.
    parked = undefined;
    scene.motions?.grab(carried, { ...feel, anchor: at });
  };

  const end = () => show(undefined, undefined, {} as CarryFeel, []);

  return {
    mark,
    hide,
    show,
    end,
    get current() {
      return landing;
    },
  };
}
