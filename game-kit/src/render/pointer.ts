// The pixel<->unit plumbing every interactive scene needs: turn a pointer event into a point in
// the model's units, and read the topmost node under it straight off the render plan. It lives in
// `render` — that is where the view, the scene plan and the unit already are — and reaches DOWN to
// `core` for the matrix, never up. Kept in the kit so no game writes its own copy.

import { apply, invert, type Transform } from "../core/transform.js";
import { byId, fieldsOf, type Node } from "../core/node.js";
import { extentOf, type BoundedFields, type Point } from "../core/atoms/bounded.js";
import { grownOutline, outlinesTouch } from "../core/overlap.js";
import { missOf } from "../core/atoms/forgiving.js";
import { scenePlan, viewTransform, type Quad } from "./scenePlan/index.js";
import { type Host } from "./host.js";

/**
 * A glass (CSS-px) point from a pointer event, relative to the view's top-left.
 *
 * Typed by what it READS rather than by what usually carries it: a wheel is not a pointer, and it
 * has a client point like everything else. The alternative is a cast at the one call site that
 * needs it, which is a cast that will be copied.
 */
export function glassOf(view: HTMLCanvasElement, e: { readonly clientX: number; readonly clientY: number }): Point {
  const r = view.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/**
 * Units from the root's origin for a glass point — the inverse of the view matrix.
 *
 * THE VIEW IS THE CAMERA'S WHEN THERE IS ONE (`camera.transform()`), and it has to be handed in:
 * the finger goes back through the SAME matrix the plan went out through, or a panned desk answers
 * the finger where the piece would have been with no camera at all. Absent, the plain centred view.
 */
export function toUnits(host: Host, g: Point, view?: Transform): Point {
  const v = host.viewport();
  const inv = invert(view ?? viewTransform(host.unit(), v.width, v.height));
  return inv ? apply(inv, g) : g;
}

/**
 * The topmost node under a glass point whose node passes `want` — read off the same plan the
 * painter drew, so what the finger hits is exactly what the eye sees. Highest z is tested first.
 *
 * Which is why `view` is here: the plan the painter drew is the plan the CAMERA drew, and a pick
 * that rebuilt it without her would agree with the eye only while the desk sat unpanned.
 *
 * And why `poses` is here (`Motions.poses()`): the plan the painter drew is also the plan the CLOCK
 * drew. Without them the finger tests where every piece RESTS, so a die halfway across a tray
 * answers to a touch on the seat it left and ignores the one on the die itself — the animation
 * reads as if it were blocking the hand, when what is blocking it is a stale hit-test.
 */
/**
 * THE FINGER, AGAINST BOTH ROOTS — the HUD first, then the desk.
 *
 * The order is not a preference: the HUD is DRAWN on top, and a hit-test that disagreed with the
 * paint would be the worst kind of wrong — a button plainly visible under the finger that answers
 * for whatever card happens to lie beneath it. So it lives HERE, once, and no consumer re-derives
 * it. The camera is handed only to the desk, for the same reason it only transforms the desk.
 *
 * Without a second root this is `pick` with an extra function call, which is what every scene that
 * has no HUD should be paying.
 */
export function pickTop(
  host: Host,
  g: Point,
  want: (n: Node) => boolean,
  view?: Transform,
  poses?: ReadonlyMap<string, Transform>,
): Node | undefined {
  const onScreen = host.hudRoot ? pick(host, host.hudRoot, g, want, undefined, poses) : undefined;
  return onScreen ?? pick(host, host.root, g, want, view, poses);
}

/**
 * HOW MUCH OF ITSELF A PIECE MUST SHOW TO TAKE THE FINGER, as a fraction of its own footprint.
 *
 * On a desk where things lie on top of each other, most of what is under the top of a pile is a
 * sliver of edge a few pixels wide. A finger that lands on one of those slivers gets a card nobody
 * was aiming at — and on a stack of thirty that is nearly every touch near the border. Below this
 * much showing, a piece does not answer at all and the finger goes to whatever is covering it, and
 * so on up the pile until something is properly visible.
 *
 * `0` is the plain answer — the topmost thing under the point, however little of it there is — and
 * it is the default, because a desk of things that do not overlap needs no ladder.
 */
export const SHOWS_ENOUGH = 0;

/** A coarse grid over a piece's own box: enough to tell a sliver of edge from a whole card. */
const SAMPLE = 9;

/** A quad's outline on the glass and its box, worked out once per pick and shared by every question. */
interface Shown {
  readonly poly: Point[];
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly shadow: boolean;
}

function shownOf(plan: readonly Quad[]): Shown[] {
  return plan.map((q) => {
    const poly = q.points.map((p) => apply(q.transform, p));
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    return { poly, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), shadow: q.layer === "shadow" };
  });
}

const apart = (a: Shown, b: Shown): boolean => a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;

/**
 * What fraction of `all[i]` is not covered by anything drawn after it.
 *
 * Sampled rather than computed: the exact answer is a polygon union, and the question being asked is
 * only "is there enough of this to aim at" — a grid answers that at a hundredth of the cost and
 * cannot be wrong by more than one cell. Shadows are not cover: a piece is not hidden by its own.
 *
 * BOXES FIRST, always. A desk can hold a hundred pieces and a pile thirty of them; asking every
 * sample against every quad above is the difference between a pick and a stall, and a box test
 * throws out all but the few that could possibly overlap.
 */
function showing(all: readonly Shown[], i: number): number {
  const own = all[i]!;
  const w = own.x1 - own.x0;
  const h = own.y1 - own.y0;
  if (w <= 0 || h <= 0) return 0;
  const above: Shown[] = [];
  for (let j = i + 1; j < all.length; j++) {
    const q = all[j]!;
    if (!q.shadow && !apart(own, q)) above.push(q);
  }
  let inside = 0;
  let clear = 0;
  for (let a = 0; a < SAMPLE; a++) {
    for (let b = 0; b < SAMPLE; b++) {
      const p = { x: own.x0 + (w * (a + 0.5)) / SAMPLE, y: own.y0 + (h * (b + 0.5)) / SAMPLE };
      if (!inPolygon(p, own.poly)) continue;
      inside++;
      if (!above.some((other) => inPolygon(p, other.poly))) clear++;
    }
  }
  return inside === 0 ? 0 : clear / inside;
}

/**
 * Walking up from `i`, the first piece drawn above it that OVERLAPS it and shows enough of itself.
 *
 * Overlaps, not contains: the point is on a sliver, and the piece that buried that sliver is the one
 * the finger meant. Falling back to `i` keeps the seam total — a pile of nothing but slivers still
 * answers with its top, which is what it did before any of this.
 */
function covers(all: readonly Shown[], i: number, showsEnough: number): number {
  const own = all[i]!;
  for (let j = all.length - 1; j > i; j--) {
    const q = all[j]!;
    if (q.shadow || apart(own, q)) continue;
    if (!outlinesTouch(own.poly, q.poly)) continue;
    if (showing(all, j) < showsEnough) continue;
    return j;
  }
  return i;
}

export function pick(
  host: Host,
  root: Node,
  g: Point,
  want: (n: Node) => boolean,
  view?: Transform,
  poses?: ReadonlyMap<string, Transform>,
  showsEnough = SHOWS_ENOUGH,
): Node | undefined {
  const v = host.viewport();
  const plan = scenePlan({
    root,
    unit: host.unit(),
    width: v.width,
    height: v.height,
    viewer: host.viewer(),
    ...(view ? { view } : {}),
    ...(poses ? { overrides: poses } : {}),
  });
  // Worked out once and shared: every question below is asked of the same glass outlines.
  const all = showsEnough > 0 ? shownOf(plan) : undefined;
  // EXACTLY AS DRAWN FIRST, and then — only if that found nothing — again for the nodes that forgive
  // a miss. Two passes and not one, because a forgiving node must never STEAL: a finger that landed
  // squarely on a card gets the card, however generous the tab under it is. What the second pass
  // catches is the touches that were going to be answered by nothing at all.
  return hitIn(plan, root, g, want, all, showsEnough, 0) ?? hitIn(plan, root, g, want, all, showsEnough, 1);
}

/** One pass of the pick: `slack` off tests the drawn outlines, on tests the forgiven ones. */
function hitIn(
  plan: readonly Quad[],
  root: Node,
  g: Point,
  want: (n: Node) => boolean,
  all: Shown[] | undefined,
  showsEnough: number,
  slack: 0 | 1,
): Node | undefined {
  for (let i = plan.length - 1; i >= 0; i--) {
    const q = plan[i]!;
    const inv = invert(q.transform);
    if (!inv) continue;
    const miss = slack ? slopIn(q, byId(root, q.id)) : 0;
    if (slack && miss <= 0) continue; // nothing to forgive: this one was already offered, exactly
    if (!inPolygon(apply(inv, g), miss > 0 ? grownOutline(q.points, miss) : q.points)) continue;
    // NOT ENOUGH OF IT TO AIM AT: the finger was never meant for this one. It belongs to whatever is
    // covering it — and that piece need not contain the point at all, which is the whole of the
    // ladder: a sliver at the bottom-left of a pile hands the touch to the pile's top, not to
    // nothing. `covers` walks up from here to the first piece that overlaps this one and shows
    // enough of itself; if the pile is nothing but slivers, the topmost of them answers as it always
    // did — a finger must always land on something.
    const owner = all && showing(all, i) < showsEnough ? covers(all, i, showsEnough) : i;
    const n = byId(root, plan[owner]!.id);
    if (n && want(n)) return n;
  }
  return undefined;
}

/**
 * HOW FAR A MISS IS FORGIVEN, IN THE QUAD'S OWN SPACE — the atom says units, a quad is drawn.
 *
 * Measured off the quad rather than multiplied by the plan's unit, because a control is usually held
 * at a constant size on the glass (`Screened`) and is therefore drawn at a scale of its own. Taking
 * the ratio between what this quad IS and what its node's bounds SAY gets both cases with one sum —
 * and gets it right for the very node this exists for.
 */
function slopIn(q: Quad, own: Node | undefined): number {
  const miss = own ? missOf(own) : 0;
  if (!own || miss <= 0) return 0;
  const box = fieldsOf<BoundedFields>(own, "Bounded")?.bounds;
  const wide = box ? extentOf(box).w : 0;
  if (wide <= 0) return 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const p of q.points) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
  }
  return x1 > x0 ? (miss * (x1 - x0)) / wide : 0;
}

/** Standard even-odd point-in-polygon, on a contour already in the tested point's space. */
function inPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const crosses = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}
