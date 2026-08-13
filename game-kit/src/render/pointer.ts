// The pixel<->unit plumbing every interactive scene needs: turn a pointer event into a point in
// the model's units, and read the topmost node under it straight off the render plan. It lives in
// `render` — that is where the view, the scene plan and the unit already are — and reaches DOWN to
// `core` for the matrix, never up. Kept in the kit so no game writes its own copy.

import { apply, invert } from "../core/transform.js";
import { byId, type Node } from "../core/node.js";
import { type Point } from "../core/atoms/bounded.js";
import { scenePlan, viewTransform } from "./scenePlan.js";
import { type Host } from "./host.js";

/** A glass (CSS-px) point from a pointer event, relative to the view's top-left. */
export function glassOf(view: HTMLCanvasElement, e: PointerEvent): Point {
  const r = view.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/** Units from the root's origin for a glass point — the inverse of the view matrix. */
export function toUnits(host: Host, g: Point): Point {
  const v = host.viewport();
  const inv = invert(viewTransform(host.unit(), v.width, v.height));
  return inv ? apply(inv, g) : g;
}

/**
 * The topmost node under a glass point whose node passes `want` — read off the same plan the
 * painter drew, so what the finger hits is exactly what the eye sees. Highest z is tested first.
 */
export function pick(host: Host, root: Node, g: Point, want: (n: Node) => boolean): Node | undefined {
  const v = host.viewport();
  const plan = scenePlan({ root, unit: host.unit(), width: v.width, height: v.height, viewer: host.viewer() });
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
