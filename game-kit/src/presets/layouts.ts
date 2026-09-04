// LAYOUT PRESETS — functions returning the same still-nameless RECORD `rowLayout` does. None
// of them registers anything: naming is the consumer's move (`registerLayout("game.court",
// gridLayout({ columns: 3 }))`), which is what keeps the kit's registry free of names nobody
// asked for and lets one game hold two grids with different numbers.
//
// Every answer here is POINTS AND NOTHING ELSE — the `place` contract has no z, angle or
// scale by type. A seat in the circle does not turn the card to face the middle: facing is
// the child's own `angle`, set by whoever owns the child, not smuggled in by the arrangement.

import { extentOf, type Point, type Shape } from "../core/atoms/bounded.js";
import { nearestSeat, type LayoutChild, type LayoutRecord } from "../core/atoms/container.js";
import type { LayoutAlign } from "../core/atoms/layouts.js";
import { finite, oneOf } from "../core/guard.js";

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
  const cols = Math.max(1, Math.floor(finite(columns, 1, "gridLayout.columns")));
  const g = finite(gap, 0, "gridLayout.gap");
  const pad = finite(padding, 0, "gridLayout.padding");
  const justify = oneOf(justifyItems, ["start", "center", "end"], "center", "gridLayout.justifyItems");
  const alignY = oneOf(alignItems, ["start", "center", "end"], "center", "gridLayout.alignItems");
  const place = (children: readonly LayoutChild[]): readonly (Point | undefined)[] => {
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
        const total = tracks.reduce((a, b) => a + b, 0) + g * Math.max(0, tracks.length - 1);
        let cursor = -total / 2;
        return tracks.map((t) => {
          const mid = cursor + t / 2;
          cursor += t + g;
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
          x: cellX[c]! + within(justify, sizes[i]!.w, colW[c]!),
          y: cellY[r]! + within(alignY, sizes[i]!.h, rowH[r]!),
        };
      });
  };
  return {
    padding: pad,
    place,
    indexAt: (point, children) => nearestSeat(place(children), point),
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
  const pad = finite(padding, 0, "slotsLayout.padding");
  const seats = slots.map((s, i) => ({
    x: finite(s.x, 0, `slotsLayout.slots[${i}].x`),
    y: finite(s.y, 0, `slotsLayout.slots[${i}].y`),
  }));
  const place = (children: readonly LayoutChild[]): readonly (Point | undefined)[] => children.map((_, i) => seats[i]);
  return {
    padding: pad,
    place,
    indexAt: (point, children) => nearestSeat(place(children), point),
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
  const r = finite(radius, 0, "radialLayout.radius");
  const st = finite(start, 0, "radialLayout.start");
  const sw = finite(sweep, 360, "radialLayout.sweep");
  const pad = finite(padding, 0, "radialLayout.padding");
  const place = (children: readonly LayoutChild[]): readonly (Point | undefined)[] => {
    const step = sw >= 360 ? sw / Math.max(1, children.length) : children.length > 1 ? sw / (children.length - 1) : 0;
    return children.map((_, i) => {
      const angle = ((st + i * step) * Math.PI) / 180;
      return { x: r * Math.sin(angle), y: -r * Math.cos(angle) };
    });
  };
  return {
    padding: pad,
    place,
    indexAt: (point, children) => nearestSeat(place(children), point),
  };
}

export interface StackLayoutOptions {
  /** How far each card sits from the one below, in units — the pile's visible thickness. `{0,0}` squares it. */
  readonly offset?: Point;
  /** Room left around the tight wrap, in units — read by `contentExtent` alone. */
  readonly padding?: number;
}

/**
 * A pile: every child on the same spot, each nudged from the one under it by `offset` so the stack
 * shows its thickness. Thickness is expressed as `at` and NEVER as `z` (CANONS): dropping a card on
 * a resting deck moves no shadow, because the cards do not rise, they shift. A pile is a HEAP — its
 * seats overlap and carry no address — so it offers no `indexAt`: you grab the top and drop on the
 * whole, you never aim a drop at a buried card.
 */
export function stackLayout({ offset = { x: 0, y: 0 }, padding = 0 }: StackLayoutOptions = {}): LayoutRecord {
  const dx = finite(offset.x, 0, "stackLayout.offset.x");
  const dy = finite(offset.y, 0, "stackLayout.offset.y");
  const pad = finite(padding, 0, "stackLayout.padding");
  return {
    padding: pad,
    // `|| 0` folds the −0 that `0 * −offset` yields at index 0 back to +0 — a negative zero is a
    // real coordinate footgun (it fails `Object.is` equality and leaks into downstream math).
    place: (children: readonly LayoutChild[]): readonly (Point | undefined)[] => children.map((_, i) => ({ x: i * dx || 0, y: i * dy || 0 })),
  };
}

export interface PileOptions {
  /** Which way the pile grows from the zone's edge: a nardy point grows from the rim toward the middle. */
  readonly direction: "up" | "down" | "left" | "right";
  /** How far each piece stands from the one below, in units. Absent = the piece's own size along the pile. */
  readonly step?: number;
  /**
   * The longest the pile may be, in units, before it is squeezed — absent = the zone's own box along
   * the direction, and with no box at all a pile is never squeezed.
   */
  readonly fit?: number;
  /** Room left around the tight wrap, in units — read by `contentExtent` alone. */
  readonly padding?: number;
}

/**
 * A pile that GROWS from one edge: the first piece sits against the rim, every next one a step
 * further in, and the whole column is squeezed when it would run past `fit`. This is a point on a
 * nardy board — fifteen checkers on the head fit on a point five checkers long because the pile
 * compresses, not because it spills over the middle.
 *
 * SQUEEZED, not cut: what the layout does with sixteen pieces on a point four long is put them all
 * there, overlapping evenly, so the count still reads (the top piece shows whole and the rest show
 * their rims). The alternative — a pile that stops placing at the fifth piece — leaves the sixth
 * standing where its own `at` says, which is nowhere, and a piece nowhere is a piece lost.
 *
 * NO `indexAt`, like `stackLayout`: a pile is aimed at as a whole, never at a piece inside it.
 * What "the next seat" is — where a piece dropped on this pile will come to rest — is the last
 * entry of `place` for one more child, which is what the landing picture asks (`landingAt`).
 */
export function pileLayout({ direction, step, fit, padding = 0 }: PileOptions): LayoutRecord {
  const dir = oneOf(direction, ["up", "down", "left", "right"], "up", "pileLayout.direction");
  const pad = finite(padding, 0, "pileLayout.padding");
  const along = dir === "up" || dir === "down";
  // Toward the middle: an "up" pile starts at the bottom rim and its y DEcreases (y grows downward).
  const sign = dir === "up" || dir === "left" ? -1 : 1;
  const place = (children: readonly LayoutChild[], box?: Shape): readonly (Point | undefined)[] => {
    const n = children.length;
    if (n === 0) return [];
    const sizes = children.map((c) => (c.footprint ? extentOf(c.footprint) : { w: 0, h: 0 }));
    const own = sizes.map((s) => (along ? s.h : s.w));
    const first = own[0] ?? 0;
    const room = box ? (along ? extentOf(box).h : extentOf(box).w) : undefined;
    const length = fit ?? room;
    // One step for the whole column: a pile of one kind of piece has one thickness, and a mixed
    // pile squeezed unevenly would read as two piles.
    const wanted = step ?? first;
    const tight = length !== undefined && n > 1 ? Math.min(wanted, Math.max(0, (length - first) / (n - 1))) : wanted;
    // The rim is the far edge of the zone's box; without a box the pile grows from the zone's origin.
    const rim = room !== undefined ? -sign * (room / 2) + sign * (first / 2) : 0;
    return children.map((_, i) => {
      const main = rim + sign * tight * i || 0;
      return along ? { x: 0, y: main } : { x: main, y: 0 };
    });
  };
  return { padding: pad, place };
}
