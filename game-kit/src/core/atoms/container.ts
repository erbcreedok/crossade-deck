// CONTAINER — not "it has children", but HOW they are arranged.
//
// Parent and child are BASE (`node.ts`): a place in the tree has two directions and one
// without the other is meaningless. A root already holds children with no atom whatsoever. So
// an atom that only carried the parent-child link would carry nothing — take the arrangement
// out of `Container` and there is no `Container` left. It IS the "where and how".
//
// The neighbouring question — "where is this node itself" — belongs to `Transformable`, and
// keeping the two apart is what makes a free canvas an ORDINARY case rather than a special
// one: `Container{layout: "free"}` places nobody, so each child keeps the `at` it was given.
//
// A layout may write `at` and MAY NOT write `z` (CANONS.md, the field-class section). Here
// that is not a scan but a type: `place` returns points, and a point has no z to write.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node, type NodeId } from "../node.js";
import { extentOf, footprint, type Point, type Shape } from "./bounded.js";
import { type TransformableFields } from "./transformable.js";
import { transformShape } from "../path.js";

export interface ContainerFields {
  /** A registry reference. The arrangement is a NAMED record, never a function on the node. */
  readonly layout: string;
}

// `children` is not a field here: the tree already holds them. Nor are `hot`, `grab`,
// `occupied`, `keeps` or `facing` — each is a separate concern and arrives with the mechanism
// that reads it, not as a row of flags nobody applies yet.
export const Container = defineAtom<ContainerFields>({
  name: "Container",
  requires: [],
  defaults: { layout: "free" },
  classes: { layout: "own" },
});

/** What a layout is told about one child. It is given data, never the tree to walk. */
export interface LayoutChild {
  readonly id: NodeId;
  /** `undefined` when the child has no box — it takes no room and a layout may skip it. */
  readonly footprint: Shape | undefined;
  /** The child's own pose, for layouts that respect it rather than override it. */
  readonly at: Point | undefined;
}

export interface LayoutRecord {
  /**
   * A pose per child, in the same order. `undefined` means "this layout does not place this
   * one" — the child's own `at` then stands, which is exactly what `free` does for everyone.
   */
  place(children: readonly LayoutChild[]): readonly (Point | undefined)[];
  /**
   * Room left AROUND the tight wrap of whatever got placed, in units, read only by
   * `contentExtent`. Not a field of `Container` for the same reason `gap` is not one: it means
   * something for a layout that packs children and nothing for one that never touches them, and
   * a field four arrangements out of five cannot use is a field that gets misread.
   */
  readonly padding?: number;
}

const LAYOUTS = new Map<string, LayoutRecord>();

export function registerLayout(name: string, record: LayoutRecord): void {
  LAYOUTS.set(name, record);
}

export function layoutRecord(name: string): LayoutRecord | undefined {
  return LAYOUTS.get(name);
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetLayouts(): void {
  LAYOUTS.clear();
}

/**
 * Where each child of this container comes to rest, by id.
 *
 * A container whose layout is not registered places nobody rather than throwing: a missing
 * record is a content error, and dropping the whole scene over one unknown name would hide
 * every other node that was perfectly fine. The inspector is where it should be visible.
 */
export function placeChildren(parent: Node): Map<NodeId, Point> {
  const out = new Map<NodeId, Point>();
  const fields = fieldsOf<ContainerFields>(parent, "Container");
  const children: LayoutChild[] = parent.children.map((c) => {
    const pose = fieldsOf<TransformableFields>(c, "Transformable");
    const box = footprint(c);
    return {
      id: c.id,
      // SCALED, and that is not a detail. A layout reserves room for what it is going to see,
      // and a card at twice the size that was measured at one overlaps its neighbour — which
      // looks like a broken layout and is a forgotten multiplication.
      //
      // The child's OWN scale only: the owner's applies to the whole row equally, so it cannot
      // change who sits where inside it.
      footprint: box && pose?.scale !== undefined && pose.scale !== 1 ? transformShape(box, { scaleX: pose.scale, scaleY: pose.scale }) : box,
      at: pose?.at,
    };
  });

  const placed = fields ? (layoutRecord(fields.layout)?.place(children) ?? []) : [];
  children.forEach((child, i) => {
    // The layout wins where it spoke; the child's own pose stands where it did not; and a
    // child with neither sits at the origin, which is the only answer left.
    out.set(child.id, placed[i] ?? child.at ?? { x: 0, y: 0 });
  });
  return out;
}

/**
 * The extent of what a container HOLDS — the other source of area, and the reason `Surfaced`
 * requires "an area" rather than a box. The desk has a surface and no size of its own.
 */
export function contentExtent(parent: Node): { readonly w: number; readonly h: number } {
  const poses = placeChildren(parent);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of parent.children) {
    const shape = footprint(child);
    if (!shape) continue; // no box, no contribution: it occupies nothing to be measured
    const { w, h } = extentOf(shape);
    const at = poses.get(child.id) ?? { x: 0, y: 0 };
    minX = Math.min(minX, at.x - w / 2);
    minY = Math.min(minY, at.y - h / 2);
    maxX = Math.max(maxX, at.x + w / 2);
    maxY = Math.max(maxY, at.y + h / 2);
  }

  // Nothing measurable inside is a zero extent, not an infinite one — and nothing to pad, either.
  if (!Number.isFinite(minX)) return { w: 0, h: 0 };

  const fields = fieldsOf<ContainerFields>(parent, "Container");
  const padding = (fields ? layoutRecord(fields.layout)?.padding : undefined) ?? 0;
  return { w: maxX - minX + padding * 2, h: maxY - minY + padding * 2 };
}
