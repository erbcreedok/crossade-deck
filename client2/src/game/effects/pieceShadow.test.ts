import { describe, it, expect } from "vitest";
import { pieceSilhouette } from "./pieceShadow";

describe("pieceSilhouette", () => {
  const base = { px: 100, py: 200, halfW: 20, halfH: 20, elev: 0, rotation: 0 };

  it("в покое (elev=0): тень чуть ниже-левее центра, размером ~с элемент", () => {
    const s = pieceSilhouette(base);
    expect(s.x).toBeLessThan(base.px); // свет справа → тень левее
    expect(s.y).toBeGreaterThan(base.py); // и ниже
    expect(s.hw).toBeCloseTo(20 * 1.04, 5);
    expect(s.hh).toBeCloseTo(20 * 1.04, 5);
    expect(s.rot).toBe(0);
  });

  it("подъём (elev>0): тень уезжает дальше вниз-влево и растёт", () => {
    const lo = pieceSilhouette(base);
    const hi = pieceSilhouette({ ...base, elev: 0.5 });
    expect(hi.x).toBeLessThan(lo.x); // дальше влево
    expect(hi.y).toBeGreaterThan(lo.y); // дальше вниз
    expect(hi.hw).toBeGreaterThan(lo.hw); // и крупнее
  });

  it("отрицательный elev не сжимает тень внутрь (clamp к 0)", () => {
    const s = pieceSilhouette({ ...base, elev: -1 });
    expect(s.hw).toBeCloseTo(20 * 1.04, 5); // как в покое, не меньше
  });

  it("поворот и разный футпринт прокидываются как есть", () => {
    const s = pieceSilhouette({ ...base, halfW: 30, halfH: 12, rotation: 0.5 });
    expect(s.rot).toBe(0.5);
    expect(s.hw).toBeGreaterThan(s.hh); // широкий низкий элемент
  });
});
