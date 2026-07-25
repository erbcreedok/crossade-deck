import { describe, it, expect } from "vitest";
import { fitBlock, squeezeOffsets } from "./sandboxLayout";

describe("fitBlock", () => {
  it("рамка = max(кнопка, контент) + 2·pad; высота = pad+кнопка+gap+карта+pad", () => {
    const b = fitBlock(100, 60, 30, 140, 16, 12);
    expect(b.boxW).toBe(100 + 32); // кнопка шире контента
    expect(b.boxH).toBe(16 + 30 + 12 + 140 + 16);
    expect(b.btnCY).toBe(16 + 15);
    expect(b.cardCY).toBe(16 + 30 + 12 + 70);
  });

  it("широкий контент задаёт ширину", () => {
    const b = fitBlock(50, 300, 30, 140, 16, 12);
    expect(b.boxW).toBe(300 + 32);
  });

  it("центры кнопки и карт не перекрываются (зазор соблюдён)", () => {
    const b = fitBlock(100, 60, 30, 140);
    const btnBottom = b.btnCY + 30 / 2;
    const cardTop = b.cardCY - 140 / 2;
    expect(cardTop).toBeGreaterThanOrEqual(btnBottom);
  });
});

describe("squeezeOffsets", () => {
  it("центрирована: средняя карта в нуле, крайние симметричны", () => {
    const o = squeezeOffsets(5, 100, 140);
    expect(o[2]).toEqual({ dx: 0, dy: 0 }); // середина под пальцем
    expect(o[0]!.dx).toBeCloseTo(-o[4]!.dx, 6);
    expect(o[0]!.dy).toBeCloseTo(-o[4]!.dy, 6);
  });

  it("тесно, но ширина ненулевая (видно количество)", () => {
    const o = squeezeOffsets(5, 100, 140);
    const width = o[4]!.dx - o[0]!.dx;
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(100 * 0.4); // заметно у́же исходного веера
  });
});
