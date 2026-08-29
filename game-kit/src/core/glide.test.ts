// The run-out law: the platform's deceleration rate, and the promise that "how far" can be asked
// before the throw and still be true after it.

import { beforeEach, describe, expect, it } from "vitest";
import {
  asGlide,
  decayGlide,
  FAST_RATE,
  glideLaw,
  glideNames,
  installStockGlides,
  NORMAL_RATE,
  registerGlide,
  resetGlides,
} from "./glide.js";

describe("glide", () => {
  beforeEach(() => {
    resetGlides();
    installStockGlides();
  });

  it("glide.stock-rates-are-the-platform-s — normal and fast are Apple's own numbers, and nothing else is registered", () => {
    expect(NORMAL_RATE).toBe(0.998);
    expect(FAST_RATE).toBe(0.99);
    expect([...glideNames()].sort()).toEqual(["fast", "normal"]);
    expect(glideLaw("normal").rate).toBe(NORMAL_RATE);
    expect(glideLaw("fast").rate).toBe(FAST_RATE);
    // Fast means fast: the same flick dies sooner under it.
    expect(glideLaw("fast").project(6)).toBeLessThan(glideLaw("normal").project(6));
  });

  it("glide.projection-matches-apple-s-published-formula — the same decay, summed instead of integrated", () => {
    // Apple publish the projection as `(v / 1000) * rate / (1 - rate)` — the discrete sum of the
    // very decay this law integrates. They part company by `-ln(r) / (1 - r) - 1`, which is a tenth
    // of a percent at the normal rate and half of one at the fast rate, and never grows. Past this
    // the Swift side and the web side would be throwing cards different distances, and one-to-one
    // is the whole point.
    for (const rate of [NORMAL_RATE, FAST_RATE, 0.995]) {
      const law = decayGlide(rate);
      for (const speed of [1, 6, 20]) {
        const apple = (speed / 1000) * (rate / (1 - rate));
        expect(Math.abs(law.project(speed) - apple) / apple).toBeLessThan(0.006);
      }
    }
    // In the units that matter: a flick of six units a second travels three units of desk, and the
    // two formulas disagree about where it stops by under a two-hundredth of a card's width.
    expect(Math.abs(decayGlide(NORMAL_RATE).project(6) - (6 / 1000) * (NORMAL_RATE / (1 - NORMAL_RATE)))).toBeLessThan(0.005);
  });

  it("glide.project-and-speedFor-invert-each-other — a throw aimed at a distance is a speed and back", () => {
    const law = decayGlide(NORMAL_RATE);
    for (const d of [0.1, 1, 3.5, 40]) expect(law.project(law.speedFor(d))).toBeCloseTo(d, 9);
    for (const v of [0.5, 6, 25]) expect(law.speedFor(law.project(v))).toBeCloseTo(v, 9);
    // And `project` is exactly the travel over an unbounded step — one integral, read two ways.
    expect(law.travel(6, 1e6)).toBeCloseTo(law.project(6), 9);
  });

  it("glide.decay-is-a-fraction-per-millisecond — after one ms exactly the rate is left, and it compounds", () => {
    const law = decayGlide(NORMAL_RATE);
    expect(law.after(0)).toBe(1);
    expect(law.after(0.001)).toBeCloseTo(NORMAL_RATE, 12);
    expect(law.after(0.002)).toBeCloseTo(NORMAL_RATE ** 2, 12);
    expect(law.after(1)).toBeCloseTo(NORMAL_RATE ** 1000, 12);
    // It only ever approaches zero — a speed under this law never reverses, which is what a linear
    // friction had to be clamped to avoid.
    expect(law.after(60)).toBeGreaterThan(0);
    expect(law.travel(0, 1)).toBe(0);
  });

  it("glide.the-edges-are-honest — a frictionless law never lands, a dead one lands at once", () => {
    const free = decayGlide(1);
    expect(free.project(5)).toBe(Infinity);
    expect(free.travel(5, 2)).toBe(10); // no decay at all: plain `v·dt`
    expect(free.speedFor(3)).toBe(0); // there is no speed that dies three units away
    const glue = decayGlide(0);
    expect(glue.after(0.001)).toBe(0);
    expect(glue.project(5)).toBe(0);
    expect(decayGlide(-1).project(5)).toBe(0);
    expect(decayGlide(2).project(5)).toBe(Infinity);
  });

  it("glide.a-registry-with-a-platform-fallback — a name resolves, an unknown name is never a body that flies forever", () => {
    registerGlide("felt", decayGlide(0.993));
    expect(glideLaw("felt").rate).toBe(0.993);
    expect(glideNames()).toContain("felt");
    // Unlike the motions registry, an unknown name is NOT nothing: a slide with no law would sail
    // off the desk and never stop. The platform default is the one answer that cannot do that.
    expect(glideLaw("no-such-law").rate).toBe(NORMAL_RATE);
    // With nothing installed at all it still holds — the fallback is the number, not a lookup.
    resetGlides();
    expect(glideLaw("normal").rate).toBe(NORMAL_RATE);
    // And a law handed over on the spot is taken as it is, name or no name.
    const own = decayGlide(0.97);
    expect(asGlide(own)).toBe(own);
    installStockGlides();
    expect(asGlide("fast").rate).toBe(FAST_RATE);
  });
});
