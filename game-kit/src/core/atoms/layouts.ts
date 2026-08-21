// THE SUPPLIED LAYOUTS — two, and they are chosen to be opposites.
//
// `free` places nobody: every child keeps the pose it was given. That is the "canvas you can
// put things anywhere on", and it is the CHEAPEST record here, not a special mode — which is
// the point. A canvas is a container with a layout that declines to place.
//
// `row` places everyone: whatever a child's own `at` said is overridden. Between them the two
// prove the rule, and the catalog scene is built on exactly that contrast.
//
// Spacing is a parameter of the RECORD, not a field of the container: a gap means something
// in a row and nothing in a free layout, and a field that four arrangements out of five
// cannot use is a field that gets misread. `padding` — room `contentExtent` leaves around the
// tight wrap, for a surface with no box of its own — is the same kind of parameter and lives
// the same place.

import { extentOf, type Point } from "./bounded.js";
import { nearestSeat, registerLayout, type LayoutChild, type LayoutRecord } from "./container.js";
import { finite, oneOf } from "../guard.js";

/**
 * Register both under the names `Container.layout` defaults to. Called by the consumer rather
 * than run on import: a module with a side effect is a module whose order of import matters,
 * and that is a debt paid at the worst possible moment.
 */
export function installStockLayouts(): void {
  registerLayout("free", freeLayout);
  registerLayout("row", rowLayout({ gap: 0.12 }));
  // The four edges, under the names a spec author would guess. A dock is a row laid against one
  // side of the room it is in — so it IS the row, told where the wall is.
  for (const edge of ["top", "bottom", "left", "right"] as const) {
    registerLayout(`dock.${edge}`, dockLayout(edge, { gap: 0.12 }));
  }
}

/** Places nobody — every child keeps its own pose. */
export const freeLayout: LayoutRecord = {
  place: (children) => children.map(() => undefined),
};

/**
 * Where a child sits ACROSS the line — the axis the walk does not travel. Named for the edge
 * that lines up, in screen terms: `start` is tops in a row and left edges in a column, `end`
 * the opposite edges, `center` the middles. Visible only when the footprints differ across —
 * equal boxes line up under every answer.
 */
export type LayoutAlign = "start" | "center" | "end";

export interface RowOptions {
  /** Space between neighbours, in units. */
  readonly gap?: number;
  /** Room left around the row's own tight wrap, in units — read by `contentExtent` alone. */
  readonly padding?: number;
  /** Which edges line up across the line. `center` when unsaid. */
  readonly align?: LayoutAlign;
  /** The axis the line runs along: left to right, or top to bottom. `row` when unsaid. */
  readonly direction?: "row" | "column";
}

/**
 * A line of children, centred on the container's origin, each taking as much room along the
 * line as its own footprint needs. A child with no box takes no room — it is still placed, so
 * that removing a box does not silently shuffle the neighbours.
 *
 * `direction` picks the axis and `align` settles the other one: both are parameters of the
 * RECORD, like `gap`, because a cross-axis means nothing to a layout that never places.
 */
export function rowLayout({ gap = 0, padding = 0, align = "center", direction = "row" }: RowOptions = {}): LayoutRecord {
  const g = finite(gap, 0, "rowLayout.gap");
  const pad = finite(padding, 0, "rowLayout.padding");
  const al = oneOf(align, ["start", "center", "end"], "center", "rowLayout.align");
  const dir = oneOf(direction, ["row", "column"], "row", "rowLayout.direction");
  const place = (children: readonly LayoutChild[]): readonly (Point | undefined)[] => {
    const sizes = children.map((c) => (c.footprint ? extentOf(c.footprint) : { w: 0, h: 0 }));
    const along = sizes.map((s) => (dir === "row" ? s.w : s.h));
    const across = sizes.map((s) => (dir === "row" ? s.h : s.w));
    const total = along.reduce((a, b) => a + b, 0) + g * Math.max(0, children.length - 1);
    // The line is only as thick as its thickest member — that is the edge `start`/`end`
    // press against. Screen axes: `start` is up in a row and left in a column.
    const thickest = across.reduce((a, b) => Math.max(a, b), 0);

    let cursor = -total / 2;
    return along.map((size, i) => {
      const main = cursor + size / 2;
      cursor += size + g;
      const cross = al === "center" ? 0 : al === "start" ? (across[i]! - thickest) / 2 : (thickest - across[i]!) / 2;
      return dir === "row" ? { x: main, y: cross } : { x: cross, y: main };
    });
  };
  return {
    padding: pad,
    place,
    indexAt: (point, children) => nearestSeat(place(children), point),
  };
}

/** Which side of the room a dock lies against. */
export type Edge = "top" | "bottom" | "left" | "right";

export interface DockOptions extends RowOptions {
  /** Air between the dock and the wall it lies against, in units. */
  readonly pad?: number;
}

/**
 * A ROW PUSHED AGAINST ONE WALL — the arrangement a bar, a rail or a toolbar actually is.
 *
 * It is the row's arithmetic along the wall and one number across it, and that is the whole of a
 * dock: nothing here knows about HUDs, cameras or screens. Put it on the HUD root and the bar sits
 * on the bottom of the glass; put it on a zone and the bar sits on the bottom of the ZONE. The
 * canon's "a widget moves between the desk and the screen by changing parent" only stays true if
 * docking never mentions which root it is on, and this is what that costs: nothing.
 *
 * WITHOUT A BOX IT PLACES NOBODY. A dock is a statement about a wall, and a container with no
 * footprint has no walls — guessing one would put a bar through the middle of the desk and call it
 * docked. Silence is the honest answer, and it is the same answer `free` gives.
 */
export function dockLayout(edge: Edge, options: DockOptions = {}): LayoutRecord {
  const along = edge === "top" || edge === "bottom" ? "row" : "column";
  const line = rowLayout({ ...options, direction: along });
  const pad = options.pad ?? 0.12;
  return {
    place(children, box) {
      if (!box) return children.map(() => undefined);
      const room = extentOf(box);
      return line.place(children).map((p, i) => {
        if (!p) return undefined;
        const own = children[i]?.footprint;
        const half = own ? extentOf(own) : { w: 0, h: 0 };
        // The wall is the room's own half-extent; the piece stops its own half short of it, so a
        // taller control docks flush like a shorter one instead of hanging through the wall.
        if (edge === "top") return { x: p.x, y: -room.h / 2 + half.h / 2 + pad };
        if (edge === "bottom") return { x: p.x, y: room.h / 2 - half.h / 2 - pad };
        if (edge === "left") return { x: -room.w / 2 + half.w / 2 + pad, y: p.y };
        return { x: room.w / 2 - half.w / 2 - pad, y: p.y };
      });
    },
    ...(line.indexAt ? { indexAt: line.indexAt } : {}),
    ...(options.padding !== undefined ? { padding: options.padding } : {}),
  };
}
