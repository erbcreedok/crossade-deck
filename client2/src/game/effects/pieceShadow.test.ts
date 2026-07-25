import { describe, it, expect } from "vitest";
import { pieceSilhouette } from "./pieceShadow";

describe("pieceSilhouette", () => {
  const base = { px: 100, py: 200, rx: 20, ry: 8, baseDy: 30, elev: 0 };

  it("в покое: эллипс (round) у основания, полуоси = rx/ry", () => {
    const s = pieceSilhouette(base);
    expect(s.round).toBe(true);
    expect(s.hw).toBeCloseTo(20, 5);
    expect(s.hh).toBeCloseTo(8, 5);
    expect(s.y).toBeCloseTo(base.py + base.baseDy, 5); // тень смещена вниз к ножке
    expect(s.x).toBeCloseTo(base.px, 5); // без подъёма — по центру
  });

  it("плоский овал: полуось по Y много меньше, чем по X (стоящая фигура)", () => {
    const s = pieceSilhouette(base);
    expect(s.hh).toBeLessThan(s.hw);
  });

  it("подъём (elev>0): тень уезжает вниз-влево и растёт", () => {
    const lo = pieceSilhouette(base);
    const hi = pieceSilhouette({ ...base, elev: 0.5 });
    expect(hi.x).toBeLessThan(lo.x);
    expect(hi.y).toBeGreaterThan(lo.y);
    expect(hi.hw).toBeGreaterThan(lo.hw);
  });

  it("shakeX сдвигает тень вбок; отрицательный elev не сжимает (clamp к 0)", () => {
    expect(pieceSilhouette({ ...base, shakeX: 5 }).x).toBeCloseTo(105, 5);
    expect(pieceSilhouette({ ...base, elev: -1 }).hw).toBeCloseTo(20, 5);
  });
});
