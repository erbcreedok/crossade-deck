// @vitest-environment jsdom
// THE DESK OPENS ONCE, AND WHERE IT OPENS IS WHERE IT STAYS.
//
// Owner, on a phone: the table came up in the middle of the glass with no chair at it, and a second
// later the chair appeared and the camera slid — the seat only arrives from the room, and until it
// does there is no place to look from. Two guards, about the two halves of that: nothing is SHOWN
// while the desk is still guessing, and the picture it does show has the whole table in it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("hub.the-cover-comes-off-after-the-view-is-home — never a frame drawn from nobody's side", () => {
    // A SCAN, because the order of two lines is exactly the sort of rule that only holds where
    // somebody looked: raising the cover one line earlier puts the middle-of-the-room frame back on
    // the glass, and every test that reads a camera would still be green.
    const raw = readFileSync(join(process.cwd(), "src/table/index.ts"), "utf8");
    expect(raw.includes("curtain(container,"), "the desk is covered while it is still guessing").toBe(true);
    const home = raw.indexOf("live.idle?.goHome()");
    expect(home, "the view is taken home from the join").toBeGreaterThan(0);
    const raised = [...raw.matchAll(/cover\.raise\(\)/g)].map((m) => m.index ?? -1);
    expect(raised.length, "every way the join can settle takes the cover off").toBeGreaterThan(1);
    for (const one of raised) expect(one, "the cover comes off after the view is home, never before").toBeGreaterThan(home);
  });
});
