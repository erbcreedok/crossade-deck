// THE ROOM THE HUD LEAVES — the one thing it tells the camera, and the only wire between them.
//
// The design (`docs/design/hud.md`) makes the tie deliberately thin and one-way: the HUD hands over
// a RECT and nothing else; the camera reads it and never asks a second question. Two layers that
// know one rectangle about each other cannot grow a dependency out of it.
//
// A RECT AND NOT AN INSET, because docks live on every edge. `insetTop` would answer for a bar along
// the bottom by being wrong, and a desk fitted against a scalar would sit under the controls on the
// three sides nobody measured.
//
// ONLY WHAT TOUCHES AN EDGE counts. A dialogue in the middle of the screen is HUD too, and taking
// its box out of the room would leave a hole no rectangle can describe — the desk would be fitted
// into a corner for as long as the dialogue stood. What a dock does is take a STRIP off one side,
// and a strip is exactly what an edge-touching box takes.

import { type Node } from "../core/node.js";
import { apply } from "../core/transform.js";
import { type Host } from "./host.js";
import { scenePlan, type Quad } from "./scenePlan.js";

/** A rectangle of glass, in device pixels — the same units a viewport is measured in. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How close to a side a quad has to reach to count as DOCKED there, in device pixels.
 *
 * Not zero: a bar laid out in units lands on fractional pixels, and a control that missed the edge
 * by a third of one would stop taking its strip — the desk would jump under it the first time a
 * resize rounded the other way.
 */
const TOUCHING = 2;

/**
 * The box a quad covers ON THE GLASS.
 *
 * Through its transform, and that is the whole of the care needed here: a quad's `points` are in its
 * OWN space — that is what lets a hit-test invert one matrix instead of walking a polygon through
 * the chain — so reading them raw measures a shape at the origin and calls every control docked.
 */
function boxOf(quad: Quad): Rect {
  const corners = quad.points.map((p) => apply(quad.transform, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The room left for the desk after the HUD has taken its strips — the whole viewport when there is
 * no HUD, or none of it reaches an edge.
 *
 * Each edge is pushed in by the furthest a DOCKED quad reaches from it, and the four are answered
 * independently: a bar along the bottom and a rail down the left take a strip each, and neither has
 * anything to say about the other two sides.
 *
 * It is computed from the PLAN rather than from the tree, so what it measures is what is drawn: a
 * control scaled by its owner, or one whose caption grew, moves this rectangle without anybody
 * having to remember to tell it.
 */
export function safeArea(host: Host, hudRoot: Node | undefined = host.hudRoot): Rect {
  const view = host.viewport();
  const whole: Rect = { x: 0, y: 0, width: view.width, height: view.height };
  if (!hudRoot) return whole;

  const plan = scenePlan({
    root: hudRoot,
    unit: host.unit(),
    width: view.width,
    height: view.height,
    viewer: host.viewer(),
  });

  let left = 0;
  let top = 0;
  let right = view.width;
  let bottom = view.height;
  for (const quad of plan) {
    const box = boxOf(quad);
    // A shadow is not a control: it is what a control throws, and a desk fitted around one would
    // shrink every time the light moved.
    if (quad.layer === "shadow") continue;
    const atLeft = box.x <= TOUCHING;
    const atRight = box.x + box.width >= view.width - TOUCHING;
    const atTop = box.y <= TOUCHING;
    const atBottom = box.y + box.height >= view.height - TOUCHING;
    // TOUCHING BOTH SIDES IS NOT DOCKING TO EITHER — it is SPANNING, and a bar along the bottom is
    // exactly that: full width, hugging the floor. Read naively it would dock left and right at
    // once and eat the entire glass, leaving a desk with nowhere to be. So an axis it spans has no
    // say on that axis, and only the other one takes its strip.
    const spansX = atLeft && atRight;
    const spansY = atTop && atBottom;
    if (atLeft && !spansX) left = Math.max(left, box.x + box.width);
    if (atRight && !spansX) right = Math.min(right, box.x);
    if (atTop && !spansY) top = Math.max(top, box.y + box.height);
    if (atBottom && !spansY) bottom = Math.min(bottom, box.y);
  }
  // A HUD that covers everything leaves NOTHING, and says so honestly rather than by handing back a
  // negative size somebody downstream would divide by.
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
