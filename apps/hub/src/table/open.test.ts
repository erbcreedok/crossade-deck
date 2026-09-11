// @vitest-environment jsdom
// WHAT THE HUB LAYS OVER A RUNNING DESK.
//
// The rest of "where a desk opens" is the runtime's now, and is guarded there
// (`@game-presets/desk`: the cover's order, the opening zoom, the room). What stays here is the one
// answer only the hub can give — its own page, its own strip, its own banner: the numbers a game
// must never have to know.

import { describe, expect, it } from "vitest";
import { topInsetOfStage } from "./hubHost.js";

/** An element with a rectangle of its own — jsdom lays nothing out and answers zeroes otherwise. */
function at(box: { top: number; height: number }, display = "block"): HTMLElement {
  const el = document.createElement("div");
  el.style.display = display;
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({ left: 0, right: 393, width: 393, top: box.top, bottom: box.top + box.height, height: box.height, x: 0, y: box.top, toJSON: () => {} }),
    configurable: true,
  });
  document.body.appendChild(el);
  return el;
}

describe("what the desk opens under", () => {
  it("hub.top-inset-is-what-covers-the-stage — the strip above the region is not counted twice", () => {
    // The region already starts below the hub's own strip, so the strip is not an inset: an empty
    // stage is an uncovered one, whatever is drawn above it.
    const stage = at({ top: 56, height: 740 - 56 });
    expect(topInsetOfStage(stage, []), "nothing over the region is no inset at all").toBe(0);

    // A banner pinned to the top of the region covers exactly its own height of it.
    expect(topInsetOfStage(stage, [at({ top: 56, height: 34 })])).toBe(34);
    // ...and one that is not shown covers nothing, which is what a plain browser tab sees.
    expect(topInsetOfStage(stage, [at({ top: 56, height: 34 }, "none")])).toBe(0);
    // The DEEPEST cover decides: two bands over one region are one band down to the lower edge.
    expect(topInsetOfStage(stage, [at({ top: 56, height: 34 }), at({ top: 56, height: 60 })])).toBe(60);
  });
});
