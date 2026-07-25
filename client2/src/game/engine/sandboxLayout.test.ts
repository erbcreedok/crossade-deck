import { describe, it, expect } from "vitest";
import { fitBlock } from "./sandboxLayout";

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
