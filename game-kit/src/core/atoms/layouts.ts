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
// cannot use is a field that gets misread.

import { extentOf, type Point } from "./bounded.js";
import { registerLayout, type LayoutChild, type LayoutRecord } from "./container.js";

/**
 * Register both under the names `Container.layout` defaults to. Called by the consumer rather
 * than run on import: a module with a side effect is a module whose order of import matters,
 * and that is a debt paid at the worst possible moment.
 */
export function installStockLayouts(): void {
  registerLayout("free", freeLayout);
  registerLayout("row", rowLayout({ gap: 0.12 }));
}

/** Places nobody — every child keeps its own pose. */
export const freeLayout: LayoutRecord = {
  place: (children) => children.map(() => undefined),
};

export interface RowOptions {
  /** Space between neighbours, in units. */
  readonly gap?: number;
}

/**
 * Left to right, centred on the container's origin, each child taking as much room as its own
 * footprint needs. A child with no box takes no width — it is still placed, so that removing
 * a box does not silently shuffle the neighbours.
 */
export function rowLayout({ gap = 0 }: RowOptions = {}): LayoutRecord {
  return {
    place(children: readonly LayoutChild[]): readonly (Point | undefined)[] {
      const widths = children.map((c) => (c.footprint ? extentOf(c.footprint).w : 0));
      const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, children.length - 1);

      let cursor = -total / 2;
      return widths.map((w) => {
        const x = cursor + w / 2;
        cursor += w + gap;
        return { x, y: 0 };
      });
    },
  };
}
