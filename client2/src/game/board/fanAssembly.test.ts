import { describe, it, expect } from "vitest";
import { fanAssembly, FAN_MAX_SPREAD } from "./fanAssembly";

const W = 100;

describe("fanAssembly", () => {
  it("одна карта лежит ровно на якоре без наклона", () => {
    const [o] = fanAssembly(["a"], W);
    expect(o).toEqual({ id: "a", dx: 0, dy: 0, rot: 0 });
  });

  it("сохраняет порядок и состав индекс-в-индекс", () => {
    const ids = ["a", "b", "c", "d"];
    const out = fanAssembly(ids, W);
    expect(out.map((o) => o.id)).toEqual(ids);
  });

  it("симметричен: крайние карты — зеркало по dx и rot, равны по dy", () => {
    const [a, b, c] = fanAssembly(["a", "b", "c"], W);
    // центральная — в нуле
    expect(b.dx).toBeCloseTo(0, 6);
    expect(b.dy).toBeCloseTo(0, 6);
    expect(b.rot).toBeCloseTo(0, 6);
    // края зеркальны
    expect(a.dx).toBeCloseTo(-c.dx, 6);
    expect(a.rot).toBeCloseTo(-c.rot, 6);
    expect(a.dy).toBeCloseTo(c.dy, 6);
  });

  it("наклон нарастает наружу от центра", () => {
    const out = fanAssembly(["a", "b", "c", "d", "e"], W);
    const rots = out.map((o) => o.rot);
    expect(rots[0]).toBeLessThan(rots[1]);
    expect(rots[1]).toBeLessThan(rots[2]);
    expect(rots[2]).toBeLessThan(rots[3]);
    expect(rots[3]).toBeLessThan(rots[4]);
    expect(rots[2]).toBeCloseTo(0, 6); // середина
  });

  it("дуга провисает: края ниже центра (dy растёт к краям)", () => {
    const [a, b, c] = fanAssembly(["a", "b", "c"], W);
    expect(a.dy).toBeGreaterThan(b.dy);
    expect(c.dy).toBeGreaterThan(b.dy);
  });

  it("общий размах ограничен: много карт не перекручивает веер", () => {
    const many = fanAssembly(Array.from({ length: 40 }, (_, i) => `c${i}`), W);
    const spread = many[many.length - 1]!.rot - many[0]!.rot;
    expect(spread).toBeLessThanOrEqual(FAN_MAX_SPREAD + 1e-6);
  });

  it("пустой набор → пустой результат", () => {
    expect(fanAssembly([], W)).toEqual([]);
  });
});
