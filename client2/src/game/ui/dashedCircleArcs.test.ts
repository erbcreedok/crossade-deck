import { describe, it, expect } from "vitest";
import { dashedCircleArcs } from "./dashedCircleArcs";

describe("dashedCircleArcs", () => {
  it("штрихи равные, шаг ровный, пунктир замыкается без обрубка (целое число периодов)", () => {
    const arcs = dashedCircleArcs(100, 12, 9);
    const circumference = 2 * Math.PI * 100;
    expect(arcs.length).toBe(Math.round(circumference / 21));
    const len = (a: { start: number; end: number }) => (a.end - a.start) * 100;
    for (const a of arcs) expect(len(a)).toBeCloseTo(len(arcs[0]!), 6);
    // шаг между началами штрихов одинаков — значит последний зазор не отличается от прочих
    for (let i = 1; i < arcs.length; i++) {
      expect(arcs[i]!.start - arcs[i - 1]!.start).toBeCloseTo(arcs[1]!.start - arcs[0]!.start, 6);
    }
  });
  it("доля штриха в периоде сохраняется (~dash/(dash+gap))", () => {
    const arcs = dashedCircleArcs(80, 12, 9);
    const total = arcs.reduce((s, a) => s + (a.end - a.start) * 80, 0);
    expect(total / (2 * Math.PI * 80)).toBeCloseTo(12 / 21, 2);
  });
  it("вырожденные входы — пусто", () => {
    expect(dashedCircleArcs(0)).toEqual([]);
    expect(dashedCircleArcs(50, 0)).toEqual([]);
  });
});
