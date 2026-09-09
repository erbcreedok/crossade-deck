// THE MARKS — the four suits and the joker's hat, the exact paths of `art/suits/*.svg` (the same
// shapes the drawn deck wears, cut out of it), each in its own measured box. `marks.test.ts`
// holds this table to those files, so the deck and its icons cannot drift apart.

import type { SuitName } from "../suits.js";
import { fmt } from "./lettering.js";

export interface Mark {
  /** The path's own box: x, y, width, height. */
  readonly viewBox: readonly [number, number, number, number];
  readonly d: string;
}

export const SUIT_MARKS: Readonly<Record<SuitName, Mark>> = {
  spade: {
    viewBox: [-8, -11, 17, 22],
    d: "M8 3C8-1 0-9 0-10 0-9-8-1-8 3q1 4 3 4 4-1 4-3c1 1-1 7-2 7h6c-1 0-3-6-2-7q0 2 4 3 2 0 3-4",
  },
  heart: {
    viewBox: [-8, -9, 17, 19],
    d: "M4-9q-5 2-4 3 1-1-4-3-3 0-4 5c0 3 7 7 8 13C1 3 8-1 8-4q0-5-4-5",
  },
  diamond: {
    viewBox: [-8, -11, 17, 22],
    d: "m3-5-3-5-3 5-5 5 8 11 3-6 5-5z",
  },
  club: {
    viewBox: [38, 14, 20, 20],
    d: "m50 23 3-5q0-3-5-4-4 1-4 4l2 5q-6-3-7 3 0 4 4 4 4-1 4-3 1 2-1 6h5q-3-5-2-6 0 2 4 3 5 0 5-4-2-6-8-3",
  },
};

export const JOKER_HAT: Mark = {
  viewBox: [0, 4, 30, 23],
  d: "M28 15q-3-3-8 0s-3-4-1-8l1 1a2 2 0 1 0-1-1q-4 1-7 7s-3-5-8-2a1 1 0 0 0-3 1h3q4-1 5 10l1 1 6 1 6-1s1-6 6-8a1 1 0 0 0 3 0z",
};

/**
 * The transform that seats a mark in a `w`×`h` box centred at (cx, cy) — fitted whole, like CSS
 * `contain`, and turned `rot` degrees about the centre. The same arithmetic whether the mark is
 * drawn in place or referenced from `<defs>`.
 */
export function seat(mark: Mark, cx: number, cy: number, w: number, h: number, rot = 0): string {
  const [vx, vy, vw, vh] = mark.viewBox;
  const s = Math.min(w / vw, h / vh);
  const turn = rot ? ` rotate(${rot})` : "";
  return `translate(${fmt(cx)},${fmt(cy)})${turn} scale(${fmt(s)}) translate(${fmt(-(vx + vw / 2))},${fmt(-(vy + vh / 2))})`;
}

/** A mark drawn in place. */
export function markAt(mark: Mark, cx: number, cy: number, w: number, h: number, fill: string, rot = 0): string {
  return `<path d="${mark.d}" fill="${fill}" transform="${seat(mark, cx, cy, w, h, rot)}"/>`;
}

/** A mark defined once under `id`, to be `markUse`d as many times as the face has pips. */
export function markDef(id: string, mark: Mark): string {
  return `<defs><path id="${id}" d="${mark.d}"/></defs>`;
}

export function markUse(id: string, mark: Mark, cx: number, cy: number, size: number, fill: string, rot = 0): string {
  return `<use href="#${id}" fill="${fill}" transform="${seat(mark, cx, cy, size, size, rot)}"/>`;
}
