// ШЕЯ — камера это голова: зум — высота головы; нагнулся — терпишь недолго, камера сама отъезжает.

import { describe, expect, it } from "vitest";
import { HEAD, NECK, restHead, type Stance } from "../src/table/bodies.js";
import { baseZoom, freshNeck, headAt, neckStep, risesAt, stretchOf, zoomAt, type Neck } from "./neck.js";

/** Держать зум `zoom` столько-то мс шагами по 16 мс; вернёт последний шаг и какие зумы ставились. */
function hold(neck: Neck, from: number, ms: number, zoom: number, base: number, stance: Stance = "sit") {
  let n = neck, last = neckStep(n, from, zoom, base, stance), z = zoom;
  for (let t = from; t <= from + ms; t += 16) {
    last = neckStep(n, t, z, base, stance);
    n = last.neck;
    if (last.zoom !== undefined) z = last.zoom;
  }
  return { last, zoom: z, neck: n };
}

describe("neck.camera-is-the-head", () => {
  it("стоя стол дальше, чем сидя, во столько раз, во сколько выше голова", () => {
    expect(baseZoom("stand")).toBeLessThan(baseZoom("sit"));
    expect(baseZoom("sit") / baseZoom("stand")).toBeCloseTo(restHead("stand") / restHead("sit"), 9);
  });

  it("в покое голова на месте; дальше покоя не поднимается; ближе — опускается, но не ниже HEAD.min", () => {
    for (const stance of ["sit", "stand"] as const) {
      const base = baseZoom(stance, 1.25);
      expect(headAt(base, base, stance)).toBeCloseTo(restHead(stance), 9);
      expect(headAt(base * 0.5, base, stance)).toBeCloseTo(restHead(stance), 9);
      expect(headAt(99, base, stance)).toBe(HEAD.min);
      expect(stretchOf(base, base, stance)).toBe(0);
      expect(stretchOf(zoomAt(1, base, stance), base, stance)).toBeCloseTo(1, 9);
    }
  });

  it("предел зума один на обе позы — голова на HEAD.min", () => {
    expect(zoomAt(1, baseZoom("sit", 1.25), "sit")).toBeCloseTo(zoomAt(1, baseZoom("stand", 1.25), "stand"), 9);
    expect(zoomAt(1, baseZoom("sit", 1.25), "sit")).toBeCloseTo(1.25 * restHead("sit") / HEAD.min, 9);
  });

  it("сидя дальше позы стоя — встаёт", () => {
    expect(risesAt(1.25)).toBeCloseTo(baseZoom("stand", 1.25), 9);
    expect(risesAt(1.25)).toBeLessThan(1);
  });
});

describe("neck.small-stretch-is-free", () => {
  it("чуть нагнулся — держится сколько угодно", () => {
    const base = 1;
    const z = zoomAt(NECK.free * 0.9, base, "sit");
    const { last } = hold(freshNeck(), 0, 20_000, z, base);
    expect(last.worn).toBe(0);
    expect(last.zoom).toBeUndefined();
  });
});

describe("neck.strain-snaps-back", () => {
  it("нагнулся — через holdMs камера сама едет к позе, потом шея отдыхает", () => {
    const base = 1;
    const top = zoomAt(1, base, "sit");
    const early = hold(freshNeck(), 0, NECK.holdMs - 200, top, base);
    expect(early.last.worn).toBeGreaterThan(0.8);
    expect(early.last.resting).toBe(false);
    const done = hold(early.neck, NECK.holdMs - 200, 200 + NECK.backMs + 100, top, base);
    expect(done.zoom, "вернулась к позе").toBeCloseTo(base, 5);
    const again = neckStep(done.neck, NECK.holdMs + NECK.backMs + 200, top, base, "sit");
    expect(again.resting, "отдыхает").toBe(true);
    expect(stretchOf(again.zoom!, base, "sit"), "дальше свободного не нагнуться").toBeCloseTo(NECK.free, 5);
    const later = neckStep(again.neck, NECK.holdMs + NECK.backMs + NECK.restMs + 400, top, base, "sit");
    expect(later.resting).toBe(false);
    expect(later.zoom).toBeUndefined();
  });

  it("стоя — то же, от своей позы", () => {
    const base = baseZoom("stand");
    const top = zoomAt(1, base, "stand");
    const done = hold(freshNeck(), 0, NECK.holdMs + NECK.backMs + 100, top, base, "stand");
    expect(done.zoom).toBeCloseTo(base, 5);
  });

  it("дальше предела не приблизить вовсе", () => {
    const step = neckStep(freshNeck(), 0, 9, 1, "sit");
    expect(step.zoom).toBeCloseTo(zoomAt(1, 1, "sit"), 5);
  });

  it("отпустил — шея отходит и снова терпит заново", () => {
    const base = 1;
    const half = hold(freshNeck(), 0, NECK.holdMs / 2, zoomAt(1, base, "sit"), base);
    const calm = hold(half.neck, NECK.holdMs / 2, NECK.holdMs, base, base);
    expect(calm.neck.strain).toBe(0);
  });
});
