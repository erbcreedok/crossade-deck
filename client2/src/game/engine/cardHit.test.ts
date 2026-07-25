import { describe, it, expect } from "vitest";
import { topmostAt, type HitBox } from "./cardHit";

const box = (px: number, z: number): HitBox => ({ px, py: 0, hw: 10, hh: 10, z });

describe("topmostAt", () => {
  it("нет накрытия → -1", () => {
    expect(topmostAt([box(0, 0), box(100, 1)], 50, 0)).toBe(-1);
  });

  it("одна накрыла → её индекс", () => {
    expect(topmostAt([box(0, 0), box(100, 1)], 2, 0)).toBe(0);
  });

  it("две перекрылись → верхняя по z, а не первая в массиве", () => {
    // индекс 0 (z=0, «нижняя 7») и индекс 1 (z=1, «верхняя 8») обе под точкой x=5
    const boxes = [box(0, 0), box(8, 1)];
    expect(topmostAt(boxes, 5, 0)).toBe(1); // побеждает верхняя (8), а не первая (7)
  });

  it("порядок в массиве не влияет — важен только z", () => {
    const boxes = [box(8, 5), box(0, 2)]; // верхняя (z5) стоит первой
    expect(topmostAt(boxes, 5, 0)).toBe(0);
    const rev = [box(0, 2), box(8, 5)]; // та же расстановка, порядок обратный
    expect(topmostAt(rev, 5, 0)).toBe(1); // всё равно z5
  });
});
