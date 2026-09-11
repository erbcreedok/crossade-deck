// THE GLASS A FAR HAND IS DRAWN ON — how big it is, how big it stays, and where a cursor lands on it.
//
// Two questions and one bug: a desk the size of a coin with somebody's dot beside it rather than on
// the card. The region the desk lives in lost its own `position` to a guard reading the inline
// style, so it collapsed to a strip and every pixel was measured against a glass a quarter of the
// phone tall.

import { describe, expect, it } from "vitest";
import { type Transform } from "game-kit";
import { dotAt, needsPositioning } from "./cursors.js";

describe("the container a cursor is pinned inside", () => {
  it("hub.stage-keeps-its-own-position — a region already positioned is left alone", () => {
    // `#stage` is `position:absolute` with `top`/`bottom` in the page's stylesheet. Told it needs a
    // `relative` of its own, the inline rule wins and the region collapses to the canvas's 2:1.
    expect(needsPositioning("absolute")).toBe(false);
    expect(needsPositioning("relative")).toBe(false);
    expect(needsPositioning("fixed")).toBe(false);
    expect(needsPositioning("sticky")).toBe(false);
  });

  it("hub.static-container-still-gets-a-home — a dot needs something to be absolute against", () => {
    expect(needsPositioning("static")).toBe(true);
  });
});

describe("where a far hand's cursor lands", () => {
  // A camera looking at the desk's origin on a 393×744 glass, 40 pixels to the unit.
  const view: Transform = { a: 40, b: 0, c: 0, d: 40, e: 196.5, f: 372 };

  it("hub.cursor-is-my-camera — the anchor is desk units, the pixels are this screen's", () => {
    expect(dotAt({ x: 0, y: 0 }, view)).toEqual({ left: 196.5, top: 372 });
    expect(dotAt({ x: 2, y: -3 }, view)).toEqual({ left: 276.5, top: 252 });
  });

  it("hub.cursor-turns-with-the-view — a rolled camera carries the dot round with it", () => {
    // The same desk seen by the seat opposite: turned 180°, the point lands on the other side.
    const turned: Transform = { a: -40, b: 0, c: 0, d: -40, e: 196.5, f: 372 };
    expect(dotAt({ x: 2, y: -3 }, turned)).toEqual({ left: 116.5, top: 492 });
  });

  it("hub.cursor-follows-the-zoom — the same anchor moves out as the glass zooms in", () => {
    const near = dotAt({ x: 3, y: 0 }, view);
    const far = dotAt({ x: 3, y: 0 }, { ...view, a: 20, d: 20 });
    expect(near.left - view.e).toBeCloseTo(2 * (far.left - view.e), 6);
  });
});
