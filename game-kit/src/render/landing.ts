import { add, byId, compose, fieldsOf, node, remove, type Node } from "../core/node.js";
import { extentOf, footprint, Bounded, type BoundedFields } from "../core/atoms/bounded.js";
import { layoutChildren, layoutRecord, type ContainerFields, type LayoutChild } from "../core/atoms/container.js";
import { Transformable, type TransformableFields } from "../core/atoms/transformable.js";
import { Private } from "../core/atoms/private.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Valued } from "../core/atoms/valued.js";
import { apply, rotate, type Vec } from "../core/transform.js";

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
 * THE FINGER IS THE HOLDER, and what hangs on it is the handle and the picture of where the load is
 * going. The load itself hangs ABOVE, clear of both. Drawn ON the finger it covers the one thing the
 * gesture is FOR: a player carrying a card across a desk could not see where the card was going,
 * because the card was in the way of the answer — and the answer is the whole reason there is a
 * picture at all. A held thing may lag the finger by a mile and it may sit some way off it; what it
 * may not do is stand on top of the place it is being sent to.
 *
 * A FACTOR of the load's height and not a fixed gap, so a card clears a card and a pile clears a
 * pile: what has to be cleared is the picture of the landing, and the landing is the load's own size.
 *
 * A THIRD, not the whole. Edge to edge is ONE — the load and the picture just touching — and that
 * is the number this began at. It is far too much: on a phone the load ends up a card's height off
 * the finger, which reads as a thing that got away from you rather than a thing in your hand, and
 * the further the load is from the place it is going, the less the picture of that place is worth.
 *
 * What had to be fixed was a load standing ON the answer and hiding it. It does not hide it any
 * more: the picture is drawn UNDER what is being carried, so the whole outline reads however far the
 * load leans over it, and this number is now only about how a held thing should sit in a hand.
 */
export const CARRY_CLEAR = 0.32;

/**
 * IT RIDES THE CARRY AND IS NEVER WRITTEN. Given to the hand as one more thing being carried — with
 * no lift, so it stays on the felt, and at the seat the run's first card will take — it follows the
 * finger for free, every frame, without a single write to the tree while the hand is moving.
 */
export function landingMark(
  at: Vec,
  box: { readonly w: number; readonly h: number; readonly shape?: Shape },
  nth: number,
  seat?: string,
  /**
   * THE TURN THE LANDING WILL HAVE (`holderTurn`), because the picture is of the LANDING and not of
   * north. A piece that lies the way its holder held it comes down at the camera's own turn, and a
   * square drawn upright beside it is a picture of a different drop from the one about to happen.
   */
  angle = 0,
): Node {
  return node(
    `landing mark ${nth}`,
    Bounded({ bounds: box.shape ?? roundedRect(box.w, box.h, Math.min(box.w, box.h) * 0.08) }),
    // WHOSE PICTURE IT IS. A seat that is known opens the mark to that seat alone; a desk with no
    // seats (a single-screen story) leaves it open, because there is nobody to hide it from.
    ...(seat ? [Private({ access: [seat] })] : []),
    Surfaced({ surface: MARK_SURFACE }),
    // UNDER WHAT IS BEING CARRIED. The picture and the load are drawn together — both ride the hand,
    // so the plan puts them in the same rank and the order inside it is the z. Left at the desk's
    // own, the mark is the newest child and lands on TOP of the very cards it is a picture for, and
    // a hand of thirty-six is read through a cage. Below them it is a shape on the felt, which is
    // what it is: the load leans over it and the outline still reads all the way round.
    Transformable({ at, angle, z: MARK_UNDER }),
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
export function landingAt(anchor: Vec, seat: Vec, zone: Node | undefined, box?: { readonly w: number; readonly h: number }): Vec {
  const home = zone ? fieldsOf<TransformableFields>(zone, "Transformable")?.at : undefined;
  if (!home || !zone) return { x: anchor.x + seat.x, y: anchor.y + seat.y };
  // ...AND IN THE ZONE, AT THE SEAT IT WILL TAKE. A zone that lays its children out has one more
  // seat than it has children, and that seat — not the zone's middle — is where this run will lie:
  // on a nardy point the picture stands on TOP of the pile already there, and on a point five deep
  // it stands where the squeeze will put it. Asked of the layout itself with one phantom child of
  // the run's own size, so the picture and the landing can never disagree. A zone with no layout,
  // or one that places nobody (`free`), keeps the old answer: its middle.
  const record = fieldsOf<ContainerFields>(zone, "Container");
  const layout = record ? layoutRecord(record.layout) : undefined;
  if (layout && box) {
    const phantom: LayoutChild = { id: "landing", footprint: rect(box.w, box.h), at: undefined };
    const placed = layout.place([...layoutChildren(zone), phantom], footprint(zone));
    const next = placed[placed.length - 1];
    if (next) return { x: home.x + next.x, y: home.y + next.y };
  }
  return home;
}

/**
 * THE SILHOUETTE THIS RUN WILL LEAVE ON THE FELT, and where its middle stands relative to the anchor.
 *
 * The shape of what will BE there, not of what is being held. A hand is carried splayed and in the
 * air; what lands is a squared pile lying flat, and its outline is the run's seats swept by one
 * piece's own box (`stackSeats` — the very seats the landing will write). One card gives one card;
 * thirty-six give a card and the pile's own step, which is a card and a sliver.
 *
 * WITH ITS LANDING POSE, which is upright: a pile has no lean, so neither has the picture of one.
 * A silhouette wearing the fan's angle would be a picture of the hand rather than of the landing.
 */
export function landingBox(
  run: readonly Node[],
  seats: readonly Vec[],
): { readonly at: Vec; readonly w: number; readonly h: number; readonly shape?: Shape } {
  const shape = run[0] ? fieldsOf<BoundedFields>(run[0], "Bounded")?.bounds : undefined;
  const own = shape ? extentOf(shape) : { w: 1, h: 1.4 };
  const xs = seats.map((seat) => seat.x);
  const ys = seats.map((seat) => seat.y);
  const x0 = Math.min(...xs) - own.w / 2;
  const x1 = Math.max(...xs) + own.w / 2;
  const y0 = Math.min(...ys) - own.h / 2;
  const y1 = Math.max(...ys) + own.h / 2;
  const w = x1 - x0;
  const h = y1 - y0;
  // ...AND IN THE SHAPE OF WHAT WILL BE LYING THERE. One piece leaves the outline of that piece: a
  // round man leaves a circle, a card a card. Drawn as a box either way, the picture said "something
  // rectangular lands here" about a checker, and the one thing the outline is for is recognising
  // what it is a picture OF. A run that SWEEPS is a pile, and the silhouette of a pile of anything
  // is the box its sweep takes — there is no one piece left to take the shape from.
  const swept = w > own.w + 1e-9 || h > own.h + 1e-9;
  const outline = !swept && shape ? shape : roundedRect(w, h, Math.min(w, h) * 0.08);
  return { at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, w, h, shape: outline };
}

/**
 * THE ZONE THE RUN IS BEING LET GO OVER, if any — asked at the piece's DRAWN place.
 *
 * Where the piece is and where the finger is are not the same point: the carry clamps the run inside
 * the border while the finger may be well outside it, and it is the PIECE a zone is taking.
 */
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
  /**
   * THE PICTURE OF WHERE THIS RUN WILL COME DOWN, and where it stands relative to the hand.
   *
   * A carry is an override and never a tree write — that is the law, and it is about PIECES: what
   * the hand is holding must not be written down until it is let go of, or a drop would have nothing
   * to write. A mark is not a piece. It is scenery the desk draws for the length of one gesture, it
   * is on the felt rather than in the hand, and it is one node: writing it costs a layout pass on a
   * desk of forty, which is what the desk does anyway every time the aim light changes.
   */
  let landing: { readonly node: Node; readonly seat: Vec; readonly hover: Vec; readonly w: number; readonly h: number } | undefined;
  /**
   * WHICH ZONE THE PICTURE IS PARKED IN, when it is in one.
   *
   * A picture on the felt is CARRIED — it rides the hand's own springs and costs the desk nothing
   * per frame. A picture in a zone does not move at all: the place is the zone, and the zone does not
   * follow the finger about. So the only moments anything has to be written are the moments the
   * answer CHANGES, which is a handful per gesture — and never the sixty a second a moving finger
   * asks for. Written every move, this hung the desk.
   */
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
  const mark = (run: readonly Node[], seats: readonly Vec[], anchorAt: Vec, angle = 0): Node | undefined => {
    if (!opts.shown || run.length === 0) return undefined;
    const box = landingBox(run, seats);
    // FOR THIS PAIR OF EYES. The picture is scenery for the hand that is carrying, and the other
    // player has no use for where somebody else's card might come down — a second outline gliding
    // about their desk is noise at best and, mirrored a frame late, a lie. So the mark is opened to
    // its own seat only, and a screen that knows whose it is draws nothing for anyone else.
    // AT THE TURN THE DROP WILL WRITE. The mark rides the hand as one more carried thing and it is
    // `still`, so the carry leaves its own pose alone (`layCarry`) — the angle written here is the
    // angle drawn for the whole of the gesture, and it is the very number `letFall` lands at.
    // ...AND THE FORMATION IS TURNED THE WAY IT WILL LIE. `landingBox` sweeps the run's seats in the
    // STACK's own frame — which is the frame the outline is drawn in, because the mark wears the
    // landing's turn — so where that outline STANDS relative to the finger has to be turned by the
    // same angle. Left square, a deck carried under a turned camera hung off its handle sideways and
    // the outline stood beside the pile rather than under it: one gesture saying two things.
    const turn = angle ? rotate(angle) : undefined;
    const seat = turn ? apply(turn, box.at) : box.at;
    const markNode = landingMark({ x: anchorAt.x + seat.x, y: anchorAt.y + seat.y }, box, marksDrawn++, scene.host.viewer().marks?.me, angle);
    add(scene.host.root, markNode);
    // ...AND THE LOAD IS PUSHED CLEAR OF IT. The finger holds the handle and the picture of where
    // this is going; the load hangs above them both, because a load drawn ON the finger covers the
    // one thing the gesture is for (`CARRY_CLEAR`).
    // FROM THE LOAD'S OWN PLACE, not from the anchor. The run is already seated at `box.at` — a pile
    // stands over its handle — so starting the clearance there as well counts that step twice, and
    // the load ends up two cards and a bit above the finger instead of one.
    // THE CLEARANCE IS LEFT SQUARE, and it is the one number here that is: the load is not `still`,
    // so the carry turns its offset with the run (`rigidCarry`) and the fall takes the same turn off
    // again (`letFall`). Turned here as well it would be turned twice, and the piece would come down
    // a whole clearance the wrong side of the outline that promised where it was going.
    landing = { node: markNode, seat, hover: { x: 0, y: -box.h * CARRY_CLEAR }, w: box.w, h: box.h };
    // TOLD BEFORE THE HAND CLOSES. A carry is an override on ids the clock already knows, and the
    // clock knows what the last draw drew: a node added and grabbed in the same breath is grabbed by
    // a clock that has never heard of it, and the override goes nowhere.
    //
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
      compose(landing.node, Transformable({ ...(own ?? {}), at: landingAt(at, landing.seat, zone, { w: landing.w, h: landing.h }) }));
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

  /**
   * A NETWORKED TREE REPLACES THE WHOLE ROOT, and the picture's own node must follow it there or
   * `hide`/`end` spend the rest of the gesture aimed at a tree nobody is looking at any more.
   *
   * `next` is a PARSE OFF THE WIRE: it answers to the same ids this screen wrote, but none of its
   * nodes is `===` the one `mark` built — `remove` compares by identity (`indexOf`), so a `hide`
   * that still held the old object would find nothing in `next` to take out, report success, and
   * leave the very node on the glass untouched. Read back by id, the reference here start pointing
   * at the tree that is actually drawn again; missing from what arrived, the picture is already
   * gone server-side and this only says so on this screen too.
   */
  const retree = (next: Node): void => {
    if (!landing) return;
    const found = byId(next, landing.node.id);
    if (!found) {
      landing = undefined;
      parked = undefined;
      hidden = false;
      return;
    }
    landing = { ...landing, node: found };
    parked = parked ? byId(next, parked.id) : parked;
  };

  return {
    mark,
    hide,
    show,
    end,
    retree,
    get current() {
      return landing;
    },
  };
}
