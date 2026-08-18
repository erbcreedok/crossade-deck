// The arithmetic a button, a drop zone, a nameplate and a badge all share. Ported case for case
// from the client it was proved in, because the point of porting it is that the four callers keep
// behaving the same — a "slightly better" rule here is four silent disagreements downstream.

import { describe, expect, it } from "vitest";
import { boxSize, captionScale, clampSize } from "./boxFit.js";

const PRESET = { w: 120, h: 40 };

describe("boxSize", () => {
  it("unit.boxfit-ported — the whole arithmetic, case for case, as the client it came from", () => {
    // PRESET: the caption does not get a vote. A row of these stands even, which is worth more
    // than packing each one tightly.
    expect(boxSize({ preset: PRESET, text: { w: 999, h: 999 } })).toEqual({ w: 120, h: 40 });

    // CONTENT: the caption's size plus padding — twice across, once down, because a caption sits
    // on its baseline and the room beneath it is the descender's rather than a second margin.
    expect(boxSize({ preset: PRESET, text: { w: 200, h: 20 }, fit: "content", padding: 10 })).toEqual({ w: 220, h: 30 });

    // An exact extent beats both ways of fitting.
    expect(boxSize({ preset: PRESET, text: { w: 200, h: 20 }, fit: "content", width: 50, height: 60 })).toEqual({ w: 50, h: 60 });

    // AND THE BOUNDS BEAT THAT. This is the case bounds are set for: "never wider than its place"
    // has to hold always, or an exact width quietly walks out of the layout.
    expect(boxSize({ preset: PRESET, text: { w: 0, h: 0 }, width: 500, maxWidth: 200 }).w).toBe(200);
    expect(boxSize({ preset: PRESET, text: { w: 0, h: 0 }, width: 10, minWidth: 80 }).w).toBe(80);
    expect(boxSize({ preset: PRESET, text: { w: 400, h: 20 }, fit: "content", padding: 8, maxWidth: 150 }).w).toBe(150);

    // An absent bound is not a bound: the value passes through untouched.
    expect(clampSize(42)).toBe(42);
  });
});

describe("captionScale", () => {
  const box = { w: 100, h: 40 };

  it("text.a-caption-that-fits-is-left-alone — and one that does not is shrunk by default", () => {
    expect(captionScale({ box, text: { w: 50, h: 20 }, padding: 8 })).toBe(1);
    // Overflowing is a breakage rather than a decision, so shrinking happens without being asked.
    expect(captionScale({ box, text: { w: 200, h: 20 }, padding: 8 })).toBeCloseTo(84 / 200);
    // Asked not to, it overflows honestly instead.
    expect(captionScale({ box, text: { w: 200, h: 20 }, padding: 8, shrink: false })).toBe(1);
  });

  it("text.growing-is-off-until-asked — a swelling caption breaks a row of equal buttons", () => {
    expect(captionScale({ box, text: { w: 10, h: 5 }, padding: 8 })).toBe(1);
    expect(captionScale({ box, text: { w: 10, h: 5 }, padding: 8, grow: true })).toBeGreaterThan(1);
  });

  it("text.the-axis-decides-what-fitting-means — across and down are different demands", () => {
    // Wide and short: it does not fit across, and it fits down with room to spare. Answering the
    // wrong one is how a caption gets clipped by the edge nobody was watching.
    const text = { w: 200, h: 5 };
    expect(captionScale({ box, text, padding: 8, axis: "horizontal" })).toBeCloseTo(84 / 200);
    expect(captionScale({ box, text, padding: 8, axis: "vertical", grow: true })).toBeCloseTo(32 / 5);
    // `both` takes the smaller: inside on both counts, guaranteed.
    expect(captionScale({ box, text, padding: 8, axis: "both" })).toBeCloseTo(84 / 200);
  });

  it("text.there-is-a-floor-under-shrinking — better a visible overflow than a silent vanishing", () => {
    expect(captionScale({ box, text: { w: 100000, h: 20 }, padding: 8 })).toBe(0.3);
    // And an unmeasured caption divides by one rather than by zero: NaN here would poison every
    // size downstream, the same way a zero unit would poison the plan's matrix.
    expect(captionScale({ box, text: { w: 0, h: 0 }, grow: true })).toBeGreaterThan(0);
  });
});
