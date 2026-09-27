// ВХОД В AR ПЛАВНЫЙ: концы — ровно обычный вид и ровно AR, середина — между ними, поворот — кратчайшей дугой.

import { describe, expect, it } from "vitest";
import { blendLook, ease, type Look } from "./arBlend.js";

const look = (k: number, e: number, rotation: number): Look => ({
  view: { a: k, b: 0, c: 0, d: k, e, f: 0 },
  k,
  squash: 1,
  rotation,
  rise: 0,
  lens: { toGlass: (p) => ({ x: p.x * k + e, y: p.y * k }), toDesk: (q) => ({ x: (q.x - e) / k, y: q.y / k }), near: () => ({ a: k, b: 0, c: 0, d: k, e, f: 0 }), kAt: () => k },
});

describe("ar-blend.entry-glides", () => {
  it("t = 0 — обычный вид как есть, t = 1 — AR как есть", () => {
    const flat = look(10, 0, 0), ar = look(30, 100, 20);
    expect(blendLook(flat, ar, 0)).toBe(flat);
    expect(blendLook(flat, ar, 1)).toBe(ar);
  });

  it("середина — между: масштаб, сдвиг и точка стола на стекле", () => {
    const got = blendLook(look(10, 0, 0), look(30, 100, 20), 0.5);
    expect(got.k).toBe(20);
    expect(got.view.e).toBe(50);
    expect(got.lens.toGlass({ x: 1, y: 1 })).toEqual({ x: 70, y: 20 });
  });

  it("поворот — кратчайшей дугой: из 350° в 10° через 0", () => {
    expect(blendLook(look(1, 0, 350), look(1, 0, 10), 0.5).rotation % 360).toBeCloseTo(0);
  });

  it("разгон и торможение: начало и конец пологие, середина — половина", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(0.1)).toBeLessThan(0.1);
  });
});
