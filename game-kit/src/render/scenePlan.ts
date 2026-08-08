// THE PLAN — what to draw, as data. Pure, and therefore testable without a GPU.
//
// This is the split that saved client1's engine and is adopted here from the start: geometry
// is a pure function, and the renderer only turns the answer into objects. Real Pixi cannot
// run in jsdom (no WebGL), so anything computed INSIDE the renderer is untestable by
// construction — every rule that lives here is a rule a plain unit test can hold down.
//
// Units become pixels exactly once, here, on the way out. Above this line everything is in
// units; below it, nothing is.

import { caps, walk, type Node, type NodeId } from "../core/node.js";
import { placeChildren } from "../core/atoms/container.js";
import { footprint, outlineOf } from "../core/atoms/bounded.js";
import { areaOf, type SurfacedFields } from "../core/atoms/surfaced.js";
import { resolveZ, type TransformableFields } from "../core/atoms/transformable.js";
import { fieldsOf } from "../core/node.js";
import { contextFor, type ResolveContext } from "../core/resolve.js";
import { type ViewerSettings } from "../core/viewer.js";
import { surfaceRecord, type SurfaceRecord } from "./surfaces.js";

/**
 * One thing to draw, in PIXELS, already ordered. The renderer adds nothing of its own — it
 * only turns a token name into a colour, which is the one thing it cannot be handed, since a
 * GPU canvas has no CSS cascade to resolve a variable in.
 */
export interface Quad {
  readonly id: NodeId;
  /** Centre, in pixels from the top-left of the view. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly radius: number;
  readonly borderWidth: number;
  readonly z: number;
  /** Token names or literal colours, straight from the record. */
  readonly fill: string | undefined;
  readonly border: string | undefined;
}

export interface PlanInput {
  readonly root: Node;
  /** Screen pixels per unit. */
  readonly unit: number;
  readonly width: number;
  readonly height: number;
  readonly viewer: ViewerSettings;
}

/**
 * Every node that is both surfaced and has an area, in paint order.
 *
 * A node with `Bounded` and no `Surfaced` produces NOTHING here — not a faint box, not an
 * outline. That is the ladder's whole point: the box is real and invisible, and the only way
 * to see one is `boundsMarks` below, which an onlooker has to ask for.
 */
export function scenePlan({ root, unit, width, height, viewer }: PlanInput): Quad[] {
  const origins = originsOf(root);
  const out: Quad[] = [];

  walk(root, (n) => {
    if (!caps(n).has("Surfaced")) return;
    const fields = fieldsOf<SurfacedFields>(n, "Surfaced");
    const area = areaOf(n);
    if (!fields || !area) return;

    // An unregistered name is skipped, not thrown: one bad reference must not take the scene
    // down and hide every node that was fine.
    const record = surfaceRecord(fields.surface);
    if (!record) return;

    const origin = origins.get(n.id) ?? { x: 0, y: 0 };
    const ctx = contextFor(n, unit, viewer);
    out.push({
      id: n.id,
      // The root's origin is the centre of the view: a scene with one node shows it in the
      // middle, which is what every catalog page assumes.
      x: width / 2 + origin.x * unit,
      y: height / 2 + origin.y * unit,
      w: area.w * unit,
      h: area.h * unit,
      // Every measurement in a record is in units too, and every one of them is converted
      // HERE. A single length left behind would be right on one screen and wrong on the next.
      radius: (record.radius ?? 0) * unit,
      borderWidth: (record.borderWidth ?? 0) * unit,
      z: resolveZ(ctx),
      fill: record.fill,
      border: record.border,
    });
  });

  // A stable sort by height: equal z keeps tree order, so siblings do not swap between frames
  // for no reason the reader can see.
  return out.sort((a, b) => a.z - b.z);
}

/**
 * One outline to stroke, in PIXELS and already closed. A mark is not a Quad: a Quad is a
 * surface somebody authored, a mark is tooling drawn over it, and merging the two would put a
 * debug setting inside the description of what the table HOLDS.
 */
export interface Mark {
  readonly id: NodeId;
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

/**
 * The footprint of every node that has one, outlined — and nothing when the viewer did not ask.
 *
 * Only boxes are marked. A container's content extent is an area too, but it is DERIVED from
 * the children that are already outlined; drawing it as well would draw the same information
 * twice and suggest the tabletop has a box of its own, which is the one thing it does not.
 */
export function boundsMarks({ root, unit, width, height, viewer }: PlanInput): Mark[] {
  if (!viewer.debugBounds) return [];

  const origins = originsOf(root);
  const marks: Mark[] = [];
  walk(root, (n) => {
    const shape = footprint(n);
    if (!shape) return; // no box, nothing to outline — and that is a real answer
    const at = origins.get(n.id) ?? { x: 0, y: 0 };
    marks.push({
      id: n.id,
      points: outlineOf(shape).map((p) => ({
        x: width / 2 + (at.x + p.x) * unit,
        y: height / 2 + (at.y + p.y) * unit,
      })),
    });
  });
  return marks;
}

/**
 * Where every node sits, in units, relative to the root — the layout's answer where a
 * container spoke, the node's own pose where it did not.
 *
 * Read top-down in one pass: a child's origin needs its owner's, and the owner is always
 * visited first.
 */
export function originsOf(root: Node): Map<NodeId, { readonly x: number; readonly y: number }> {
  const origins = new Map<NodeId, { x: number; y: number }>();
  origins.set(root.id, ownPose(root));

  walk(root, (n) => {
    const here = origins.get(n.id) ?? { x: 0, y: 0 };
    const placed = placeChildren(n);
    for (const child of n.children) {
      const at = placed.get(child.id) ?? ownPose(child);
      origins.set(child.id, { x: here.x + at.x, y: here.y + at.y });
    }
  });

  return origins;
}

function ownPose(n: Node): { x: number; y: number } {
  const at = fieldsOf<TransformableFields>(n, "Transformable")?.at;
  return { x: at?.x ?? 0, y: at?.y ?? 0 };
}

export type { ResolveContext };
