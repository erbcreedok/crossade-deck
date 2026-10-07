import { describe, expect, it } from "vitest";
import { BLINK, blinkOn, mergePhase } from "./merge.js";
import { MERGE_MS } from "./contract.js";

const t = { delay: MERGE_MS.delay, glow: MERGE_MS.glow, blink: MERGE_MS.blink }, d = t.delay, g = t.glow, b = t.blink;

describe("слияние держанием: фазы по времени", () => {
  it("0–0,25 с свободна; до 0,45 с ровный свет; до 1,95 с мигает; дальше подъём", () => {
    expect([0, 100, d - 1].map((ms) => mergePhase(ms, t))).toEqual(["free", "free", "free"]);
    expect([d, d + 50, d + g - 1].map((ms) => mergePhase(ms, t))).toEqual(["steady", "steady", "steady"]);
    expect([d + g, d + g + 100, d + g + b - 1].map((ms) => mergePhase(ms, t))).toEqual(["blink", "blink", "blink"]);
    expect([d + g + b, 5000].map((ms) => mergePhase(ms, t))).toEqual(["lift", "lift"]);
    expect(t).toEqual({ delay: 400, glow: 300, blink: 400 });
  });
  it("все три времени — ручки: фазы сдвигаются вместе с ними", () => {
    const k = { delay: 100, glow: 500, blink: 300 };
    expect([99, 100, 599, 600, 899, 900].map((ms) => mergePhase(ms, k))).toEqual(["free", "steady", "steady", "blink", "blink", "lift"]);
  });
  it("мигание: начинается с паузы, сначала горит реже, чем не горит, потом чаще; мигает всё быстрее", () => {
    const T = 1500, step = 5;
    const share = (from: number, to: number) => { let on = 0, n = 0; for (let ms = from; ms < to; ms += step) { n++; if (blinkOn(ms, T)) on++; } return on / n; };
    expect(blinkOn(0, T)).toBe(false);
    expect(share(0, 500)).toBeLessThan(0.5);
    expect(share(1000, 1500)).toBeGreaterThan(0.5);
    const flips = (from: number, to: number) => { let n = 0, was = blinkOn(from, T); for (let ms = from + step; ms < to; ms += step) { const now = blinkOn(ms, T); if (now !== was) n++; was = now; } return n; };
    expect(flips(1000, 1500)).toBeGreaterThan(flips(0, 500));
    expect(BLINK.duty0).toBeLessThan(0.5);
    expect(BLINK.duty1).toBeGreaterThan(0.5);
  });
});
