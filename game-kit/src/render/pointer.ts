// The pixel<->unit plumbing every interactive scene needs: turn a pointer event into a point in
// the model's units, and read the topmost node under it straight off the render plan. It lives in
// `render` — that is where the view, the scene plan and the unit already are — and reaches DOWN to
// `core` for the matrix, never up. Kept in the kit so no game writes its own copy.

import { apply, invert, type Transform } from "../core/transform.js";
import { byId, type Node } from "../core/node.js";
import { type Point } from "../core/atoms/bounded.js";
import { outlinesTouch } from "../core/overlap.js";
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

/** The quad's outline on the glass — its own points carried through its matrix. */
function onGlass(q: Quad): Point[] {
  return q.points.map((p) => apply(q.transform, p));
}

/**
 * What fraction of `plan[i]` is not covered by anything drawn after it.
 *
 * Sampled rather than computed: the exact answer is a polygon union, and the question being asked is
 * only "is there enough of this to aim at" — a grid answers that at a hundredth of the cost and
 * cannot be wrong by more than one cell. Shadows are not cover: a piece is not hidden by its own.
 */
function showing(plan: readonly Quad[], i: number): number {
  const own = onGlass(plan[i]!);
  const xs = own.map((p) => p.x);
  const ys = own.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  if (w <= 0 || h <= 0) return 0;
  const above = plan.slice(i + 1).filter((q) => q.layer !== "shadow").map(onGlass);
  let inside = 0;
  let clear = 0;
  for (let a = 0; a < SAMPLE; a++) {
    for (let b = 0; b < SAMPLE; b++) {
      const p = { x: x0 + (w * (a + 0.5)) / SAMPLE, y: y0 + (h * (b + 0.5)) / SAMPLE };
      if (!inPolygon(p, own)) continue;
      inside++;
      if (!above.some((other) => inPolygon(p, other))) clear++;
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
function covers(plan: readonly Quad[], i: number, showsEnough: number): number {
  const own = onGlass(plan[i]!);
  for (let j = plan.length - 1; j > i; j--) {
    const q = plan[j]!;
    if (q.layer === "shadow") continue;
    if (!outlinesTouch(own, onGlass(q))) continue;
    if (showing(plan, j) < showsEnough) continue;
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
  for (let i = plan.length - 1; i >= 0; i--) {
    const q = plan[i]!;
    const inv = invert(q.transform);
    if (!inv) continue;
    if (!inPolygon(apply(inv, g), q.points)) continue;
    // NOT ENOUGH OF IT TO AIM AT: the finger was never meant for this one. It belongs to whatever is
    // covering it — and that piece need not contain the point at all, which is the whole of the
    // ladder: a sliver at the bottom-left of a pile hands the touch to the pile's top, not to
    // nothing. `covers` walks up from here to the first piece that overlaps this one and shows
    // enough of itself; if the pile is nothing but slivers, the topmost of them answers as it always
    // did — a finger must always land on something.
    const owner = showsEnough > 0 && showing(plan, i) < showsEnough ? covers(plan, i, showsEnough) : i;
    const n = byId(root, plan[owner]!.id);
    if (n && want(n)) return n;
  }
  return undefined;
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
