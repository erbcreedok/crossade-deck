// The pixel<->unit plumbing every interactive scene needs: turn a pointer event into a point in
// the model's units, and read the topmost node under it straight off the render plan. It lives in
// `render` — that is where the view, the scene plan and the unit already are — and reaches DOWN to
// `core` for the matrix, never up. Kept in the kit so no game writes its own copy.

import { apply, invert, type Transform } from "../core/transform.js";
import { byId, type Node } from "../core/node.js";
import { type Point } from "../core/atoms/bounded.js";
import { scenePlan, viewTransform } from "./scenePlan.js";
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
export function pick(
  host: Host,
  root: Node,
  g: Point,
  want: (n: Node) => boolean,
  view?: Transform,
  poses?: ReadonlyMap<string, Transform>,
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
    const n = byId(root, q.id);
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
