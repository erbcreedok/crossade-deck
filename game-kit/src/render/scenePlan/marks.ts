// TOOLING DRAWN OVER THE DESK — the grid and the bounds outlines an onlooker switches on.
//
// Apart from the plan on purpose: a debug setting has no business inside the description of what
// the desk HOLDS, and these walk the same tree for a different answer.

import { type Point } from "../../core/atoms/bounded.js";
import { walk, type Node, type NodeId } from "../../core/node.js";
import { footprint, outlineOf } from "../../core/atoms/bounded.js";
import { apply, compose, IDENTITY, move, scale, type Transform } from "../../core/transform.js";
import { type Mark } from "./quads.js";
import { type PlanInput } from "./input.js";
import { transformsOf } from "./transforms.js";

const ORIGIN_ARM = 0.1;

/**
 * THE COORDINATE GRID — one line per unit, so a size can be READ off the scene.
 *
 * A second debug layer, and the reason it is separate from the box outline: they answer
 * different questions. The outline says where this node is; the grid says how big anything is,
 * without a node being involved at all. Switched on together they are still readable because a
 * mark carries its own ink — the grid is the faint one.
 *
 * Ruled from the ROOT's origin, which is the centre of the view, so the lines cross exactly
 * where a node with no pose sits. A grid pinned to the top-left corner instead would put its
 * zero somewhere no measurement starts from.
 */
/**
 * Units into view pixels, with the ROOT's origin at the centre of the view.
 *
 * The one place that knows a unit is worth pixels, and the one place that knows where zero is.
 * It was three inline copies of `width / 2 + x * unit`; a fourth was about to be written for
 * the grid, which is when it became obvious.
 */
/**
 * The screen-space undo of a camera's squash, or nothing when there is none to undo.
 *
 * Applied ABOUT A NODE'S OWN ORIGIN by whoever uses it: standing a billboard up must not walk it up
 * the screen, and a bare scale about the glass's centre would do exactly that to everything but the
 * one node in the middle.
 */
export function pitchStand(pitch: number | undefined): Transform | undefined {
  if (!pitch) return undefined;
  const squash = Math.max(0.02, Math.cos((pitch * Math.PI) / 180));
  return squash === 1 ? undefined : scale(1, 1 / squash);
}

export function viewTransform(unit: number, width: number, height: number): Transform {
  return compose(move(width / 2, height / 2), scale(unit));
}

export function gridMarks({ unit, width, height, viewer }: PlanInput): Mark[] {
  if (!viewer.debugGrid || unit <= 0) return [];
  // A grid finer than a few pixels is a wash of colour, not a grid: at that point it hides the
  // scene it is there to measure. Nothing is drawn rather than something unreadable.
  if (unit < 6) return [];

  const marks: Mark[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const line = (points: readonly Point[]): Mark => ({
    id: GRID_ID,
    closed: false,
    points,
    paint: "grid",
    width: 1,
  });
  const minor = (points: readonly Point[]): Mark => ({
    id: GRID_ID,
    closed: false,
    points,
    paint: "gridMinor",
    width: 0.5,
  });
  for (let i = 0; cx + i * unit <= width || cx - i * unit >= 0; i += 1) {
    for (const x of i === 0 ? [cx] : [cx + i * unit, cx - i * unit]) {
      if (x >= 0 && x <= width) marks.push(line([{ x, y: 0 }, { x, y: height }]));
    }
  }
  for (let i = 0; cy + i * unit <= height || cy - i * unit >= 0; i += 1) {
    for (const y of i === 0 ? [cy] : [cy + i * unit, cy - i * unit]) {
      if (y >= 0 && y <= height) marks.push(line([{ x: 0, y }, { x: width, y }]));
    }
  }

  // THE TENTHS, ruled all the way across like the units — just quieter.
  //
  // As ticks on the axes they were a scale you had to carry to the shape by eye. As lines they
  // are a grid you can read a width off wherever the shape happens to be. What keeps them from
  // becoming a wash is that they are not the same line: half the width and their own, dimmer
  // token, so the whole units still read as the whole units.
  //
  // Dropped once a tenth is only a few pixels apart, for the same reason the units are: a line
  // nobody can resolve is ink, not information.
  if (unit * MINOR >= 8) {
    const step = unit * MINOR;
    const across = Math.ceil(width / 2 / step);
    const down = Math.ceil(height / 2 / step);
    for (let i = -across; i <= across; i += 1) {
      if (i % 10 === 0) continue; // a whole unit already has its own, stronger line
      const x = cx + i * step;
      if (x >= 0 && x <= width) marks.push(minor([{ x, y: 0 }, { x, y: height }]));
    }
    for (let i = -down; i <= down; i += 1) {
      if (i % 10 === 0) continue;
      const y = cy + i * step;
      if (y >= 0 && y <= height) marks.push(minor([{ x: 0, y }, { x: width, y }]));
    }
  }
  return marks;
}

/** A tenth of a unit — the subdivision a reader actually estimates in. */
const MINOR = 0.1;

/**
 * The grid belongs to no node, and says so. Every other mark names the node it outlines; an
 * empty id here would read as "the root", which is a different and wrong claim.
 */
const GRID_ID = "" as NodeId;

/**
 * The footprint of every node that has one, outlined — and nothing when the viewer did not ask.
 *
 * Only boxes are marked. A container's content extent is an area too, but it is DERIVED from
 * the children that are already outlined; drawing it as well would draw the same information
 * twice and suggest the desk has a box of its own, which is the one thing it does not.
 *
 * The mark keeps the box's SHARP corners even when the surface over it is rounded: it reports
 * where the box is, and a rounded corner is a matter of paint.
 */
export function boundsMarks({ root, unit, width, height, viewer, view, overrides }: PlanInput): Mark[] {
  if (!viewer.debugBounds) return [];

  const nodes = transformsOf(root);
  const toView = view ?? viewTransform(unit, width, height);
  const marks: Mark[] = [];
  walk(root, (n) => {
    const shape = footprint(n);
    if (!shape) return; // no box, nothing to outline — and that is a real answer
    // THE POSE THE NODE IS DRAWN AT, not the one it rests at — the same choice the quads make,
    // and it has to be the same or the layer contradicts the picture it is drawn over. A carry is
    // an override and never a tree write, so a node in a hand rests where it was picked up: read
    // from the tree, the outline stays behind while the surface goes with the finger, and the
    // reader is looking at one element wearing two positions. The box IS the element.
    const toGlass = compose(toView, overrides?.get(n.id) ?? nodes.get(n.id) ?? IDENTITY);
    const px = (p: Point): Point => apply(toGlass, p);
    marks.push({ id: n.id, closed: true, points: outlineOf(shape).map(px), paint: "debug", width: 1 });

    // AND THE ORIGIN ITSELF, as a cross.
    //
    // `(0,0)` in a node's own coordinates is the point everything is measured from: `at` puts
    // THAT there, and a rotation will turn about THAT. For a rect or a circle it is the centre
    // by construction, but a polygon or a path carries whatever coordinates its author wrote —
    // so a pasted shape can sit far off its own origin, and nothing on screen said so. The
    // first anyone would learn of it is the shape flying off on its first rotation.
    const arm = (a: Point, b: Point): Mark => ({ id: n.id, closed: false, points: [px(a), px(b)], paint: "debug", width: 1 });
    marks.push(arm({ x: -ORIGIN_ARM, y: 0 }, { x: ORIGIN_ARM, y: 0 }));
    marks.push(arm({ x: 0, y: -ORIGIN_ARM }, { x: 0, y: ORIGIN_ARM }));
  });
  return marks;
}
