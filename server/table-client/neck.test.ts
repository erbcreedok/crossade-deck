// ШЕЯ — приблизился сильнее позы: терпишь недолго, камера сама отъезжает, шея отдыхает.

import { describe, expect, it } from "vitest";
import { NECK } from "../src/table/bodies.js";
import { baseZoom, freshNeck, neckStep, stretchOf, type Neck } from "./neck.js";

/** Держать зум `zoom` столько-то мс шагами по 16 мс; вернёт последний шаг и какие зумы ставились. */
function hold(neck: Neck, from: number, ms: number, zoom: number, base: number) {
  let n = neck, last = neckStep(n, from, zoom, base), z = zoom;
  for (let t = from; t <= from + ms; t += 16) {
    last = neckStep(n, t, z, base);
    n = last.neck;
    if (last.zoom !== undefined) z = last.zoom;
  }
  return { last, zoom: z, neck: n };
}

describe("neck.stance-sets-the-distance", () => {
  it("стоя стол дальше, чем сидя", () => {
    expect(baseZoom("stand")).toBeLessThan(baseZoom("sit"));
  });

  it("натяг — от позы: не ближе позы — ноль, на пределе — единица", () => {
    const base = baseZoom("stand");
    expect(stretchOf(base * 0.8, base)).toBe(0);
    expect(stretchOf(base, base)).toBe(0);
    expect(stretchOf(base * NECK.zoom, base)).toBeCloseTo(1, 9);
  });
});

describe("neck.small-stretch-is-free", () => {
  it("небольшой натяг держится сколько угодно", () => {
    const base = 1;
    const z = base * (1 + NECK.free * 0.9 * (NECK.zoom - 1));
    const { last } = hold(freshNeck(), 0, 20_000, z, base);
    expect(last.worn).toBe(0);
    expect(last.zoom).toBeUndefined();
  });
});

describe("neck.strain-snaps-back", () => {
  it("на пределе — через holdMs камера сама едет к позе, потом шея отдыхает", () => {
    const base = 1;
    const top = base * NECK.zoom;
    const early = hold(freshNeck(), 0, NECK.holdMs - 200, top, base);
    expect(early.last.worn).toBeGreaterThan(0.8);
    expect(early.last.resting).toBe(false);
    const done = hold(early.neck, NECK.holdMs - 200, 200 + NECK.backMs + 100, top, base);
    expect(done.zoom, "вернулась к позе").toBeCloseTo(base, 5);
    const again = neckStep(done.neck, NECK.holdMs + NECK.backMs + 200, top, base);
    expect(again.resting, "отдыхает").toBe(true);
    expect(stretchOf(again.zoom!, base), "выше свободного не натянуть").toBeCloseTo(NECK.free, 5);
    const later = neckStep(again.neck, NECK.holdMs + NECK.backMs + NECK.restMs + 400, top, base);
    expect(later.resting).toBe(false);
    expect(later.zoom).toBeUndefined();
  });

  it("дальше предела не приблизить вовсе", () => {
    const step = neckStep(freshNeck(), 0, 9, 1);
    expect(step.zoom).toBeCloseTo(NECK.zoom, 5);
  });

  it("отпустил натяг — шея отходит и снова терпит заново", () => {
    const base = 1;
    const half = hold(freshNeck(), 0, NECK.holdMs / 2, base * NECK.zoom, base);
    const calm = hold(half.neck, NECK.holdMs / 2, NECK.holdMs, base, base);
    expect(calm.neck.strain).toBe(0);
  });
});
