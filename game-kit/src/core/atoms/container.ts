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

/**
 * HOW A POSE RELAXES INTO REST HERE — the road, which is not the destination.
 *
 * A mat that squares a card up and a mat that lets it lie askew for a few seconds first agree
 * exactly about where the card ENDS; they differ only in the curve. So this is not part of the pose
 * and not part of the transaction: the rest pose is authoritative, the road to it is decoration.
 *
 * It belongs to the ARRANGEMENT because the arrangement is what already answers "where do children
 * of this container go" — a hand fans, a stack piles, and how each of them relaxes is the same kind
 * of knowledge. `hold: 0, ms: 0` is a snap, which is what a settle means when nobody asks for one.
 */
export interface Settle {
  /** Lie still this long first, ms. The card stays exactly where the finger left it. */
  readonly hold: number;
  /** Then travel for this long, ms. Zero is instant — no road at all. */
  readonly ms: number;
  /** Registry name of the easing that shapes the travel (`installStockEasings`). */
  readonly ease: string;
}

export interface LayoutRecord {
  /**
   * A pose per child, in the same order. `undefined` means "this layout does not place this
   * one" — the child's own `at` then stands, which is exactly what `free` does for everyone.
   */
  place(children: readonly LayoutChild[]): readonly (Point | undefined)[];
  /**
   * The INVERSE of `place`: which child's seat a point falls on, by index — the address a drop
   * resolves to. OPTIONAL, and absent on purpose where a layout has no addresses: a free canvas
   * or a heap answers "no seat", a point there is a position and not an address (a heap keeps
   * none, per the design doc). The law is a round-trip, `indexAt(place(children)[i]) === i` for every
   * placed `i`, guarded in the test plan; a fan answers differently from a row because each reads
   * its own `place`. `undefined` return means "no seat here" (no children, or none close enough).
   */
  indexAt?(point: Point, children: readonly LayoutChild[]): number | undefined;
  /**
   * Room left AROUND the tight wrap of whatever got placed, in units, read only by
   * `contentExtent`. Not a field of `Container` for the same reason `gap` is not one: it means
   * something for a layout that packs children and nothing for one that never touches them, and
   * a field four arrangements out of five cannot use is a field that gets misread.
   */
  readonly padding?: number;
  /**
   * How a pose relaxes into rest in this arrangement. ABSENT is the ordinary case and means "the
   * runtime's own settle" — the tuning, exactly as before an arrangement had a say. A record only
   * speaks up when it wants something other than the house curve.
   */
  readonly settle?: Settle;
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
 * The children as a layout is told about them — data, never the tree to walk. One source, so
 * `placeChildren` and `slotAt` measure the same footprints and cannot disagree about a seat.
 */
/**
 * The same list, for a reader that has to ask the layout something the tree cannot answer on its
 * own — how a hand parts around a newcomer (`core/part.ts`). One source, so a preview and a real
 * placement can never disagree about a footprint.
 */
export function layoutChildren(parent: Node): LayoutChild[] {
  return layoutChildrenOf(parent);
}

function layoutChildrenOf(parent: Node): LayoutChild[] {
  return parent.children.map((c) => {
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
  const children = layoutChildrenOf(parent);

  const placed = fields ? (layoutRecord(fields.layout)?.place(children) ?? []) : [];
  children.forEach((child, i) => {
    // The layout wins where it spoke; the child's own pose stands where it did not; and a
    // child with neither sits at the origin, which is the only answer left.
    out.set(child.id, placed[i] ?? child.at ?? { x: 0, y: 0 });
  });
  return out;
}

/**
 * Nearest placed seat to a point, by centre distance — the tie-break the canon already picks for
 * two overlapping hit-zones (CANONS §4). `undefined`-placed children have no seat and are skipped;
 * the answer is `undefined` when none was placed. Squared distance: monotonic, no `sqrt` needed.
 */
export function nearestSeat(placed: readonly (Point | undefined)[], point: Point): number | undefined {
  let best: number | undefined;
  let bestD = Infinity;
  placed.forEach((p, i) => {
    if (!p) return;
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Which child's seat a point lands on, by id — the drop target under a finger. `undefined` when
 * the layout keeps no addresses (a free canvas, a heap: `indexAt` is absent) or the container is
 * empty. Delegates to the layout's own `indexAt`, so a fan answers differently from a row.
 */
export function slotAt(parent: Node, point: Point): NodeId | undefined {
  const fields = fieldsOf<ContainerFields>(parent, "Container");
  const record = fields ? layoutRecord(fields.layout) : undefined;
  if (!record?.indexAt) return undefined;
  const i = record.indexAt(point, layoutChildrenOf(parent));
  return i === undefined ? undefined : parent.children[i]?.id;
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
