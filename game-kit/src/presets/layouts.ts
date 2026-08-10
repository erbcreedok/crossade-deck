// LAYOUT PRESETS — functions returning the same still-nameless RECORD `rowLayout` does. None
// of them registers anything: naming is the consumer's move (`registerLayout("game.court",
// gridLayout({ columns: 3 }))`), which is what keeps the kit's registry free of names nobody
// asked for and lets one game hold two grids with different numbers.
//
// Every answer here is POINTS AND NOTHING ELSE — the `place` contract has no z, angle or
// scale by type. A seat in the circle does not turn the card to face the middle: facing is
// the child's own `angle`, set by whoever owns the child, not smuggled in by the arrangement.

import { extentOf, type Point } from "../core/atoms/bounded.js";
import type { LayoutChild, LayoutRecord } from "../core/atoms/container.js";
import type { LayoutAlign } from "../core/atoms/layouts.js";

export interface GridOptions {
  /** How many cells wide the grid is. Children fill it in reading order, left to right first. */
  readonly columns: number;
  /** Space between neighbouring tracks, in units — both axes, the same number. */
  readonly gap?: number;
  /** Room left around the tight wrap, in units — read by `contentExtent` alone. */
  readonly padding?: number;
  /** Where a child sits ACROSS its cell: left edge, middle, right edge. `center` when unsaid. */
  readonly justifyItems?: LayoutAlign;
  /** And where it sits DOWN its cell: top, middle, bottom. `center` when unsaid. */
  readonly alignItems?: LayoutAlign;
}

/**
 * Cells in reading order, centred on the container's origin. A track is as wide as the widest
 * footprint in it and as tall as the tallest — the grid fits its members rather than cutting
 * them to a constant. A cell is an ADDRESS: a partial last row keeps its columns instead of
 * recentring, because a card that moves when its neighbour leaves is a card the reader loses.
 */
export function gridLayout({ columns, gap = 0, padding = 0, justifyItems = "center", alignItems = "center" }: GridOptions): LayoutRecord {
  const cols = Math.max(1, Math.floor(columns));
  return {
    padding,
    place(children: readonly LayoutChild[]): readonly (Point | undefined)[] {
      const sizes = children.map((c) => (c.footprint ? extentOf(c.footprint) : { w: 0, h: 0 }));
      const used = Math.min(cols, children.length);
      const rows = Math.ceil(children.length / cols);
      const colW = Array.from({ length: used }, (_, c) =>
        sizes.filter((_, i) => i % cols === c).reduce((a, s) => Math.max(a, s.w), 0),
      );
      const rowH = Array.from({ length: rows }, (_, r) =>
        sizes.filter((_, i) => Math.floor(i / cols) === r).reduce((a, s) => Math.max(a, s.h), 0),
      );

      // Cell middles by cursor walk, the row's own arithmetic run once per axis.
      const centres = (tracks: readonly number[]): number[] => {
        const total = tracks.reduce((a, b) => a + b, 0) + gap * Math.max(0, tracks.length - 1);
        let cursor = -total / 2;
        return tracks.map((t) => {
          const mid = cursor + t / 2;
          cursor += t + gap;
          return mid;
        });
      };
      const cellX = centres(colW);
      const cellY = centres(rowH);

      const within = (align: LayoutAlign, size: number, track: number): number =>
        align === "center" ? 0 : align === "start" ? (size - track) / 2 : (track - size) / 2;

      return children.map((_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        return {
          x: cellX[c]! + within(justifyItems, sizes[i]!.w, colW[c]!),
          y: cellY[r]! + within(alignItems, sizes[i]!.h, rowH[r]!),
        };
      });
    },
  };
}

export interface SlotsOptions {
  /** The prepared places, in units on the container's origin — seat 1, seat 2, seat 3. */
  readonly slots: readonly Point[];
  /** Room left around the tight wrap, in units — read by `contentExtent` alone. */
  readonly padding?: number;
}

/**
 * Prepared places, taken in tree order: the first child stands in the first slot. A child
 * BEYOND the slots is answered `undefined` — its own pose stands, exactly as under `free` —
 * because a board with six seats and a seventh guest is a content situation, not a crash, and
 * the six that fit must not shuffle to absorb it.
 */
export function slotsLayout({ slots, padding = 0 }: SlotsOptions): LayoutRecord {
  return {
    padding,
    place: (children) => children.map((_, i) => slots[i]),
  };
}

export interface RadialOptions {
  /** How far from the container's origin every seat stands, in units. */
  readonly radius: number;
  /** Where the first child stands, in degrees clockwise from twelve o'clock. 0 when unsaid. */
  readonly start?: number;
  /**
   * The whole arc, first child to last, in degrees. The full 360 shares the circle evenly
   * with no doubled seat at the seam; anything less is an arc walked end to end, both ends
   * taken — the fan's fencepost, not the circle's.
   */
  readonly sweep?: number;
  /** Room left around the tight wrap, in units — read by `contentExtent` alone. */
  readonly padding?: number;
}

/**
 * Seats on a circle — players around a table, options around a wheel. Angles run CLOCKWISE
 * from twelve o'clock, the same sense `Transformable.angle` turns, so a seat at 90° is on the
 * right of the screen. The seat is a point: a card that should FACE the middle says so with
 * its own `angle`.
 */
export function radialLayout({ radius, start = 0, sweep = 360, padding = 0 }: RadialOptions): LayoutRecord {
  return {
    padding,
    place(children: readonly LayoutChild[]): readonly (Point | undefined)[] {
      const step = sweep >= 360 ? sweep / Math.max(1, children.length) : children.length > 1 ? sweep / (children.length - 1) : 0;
      return children.map((_, i) => {
        const angle = ((start + i * step) * Math.PI) / 180;
        return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
      });
    },
  };
}
