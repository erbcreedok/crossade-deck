import { describe, it, expect } from "vitest";
import { fitBlock, squeezeOffsets, fitSection, SB_BOX_PAD, SB_HEADER_GAP } from "./sandboxLayout";

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

describe("fitSection", () => {
  it("рамка = контент + 2·pad; высота = pad+заголовок+headerGap+контент+pad", () => {
    const s = fitSection(400, 200, 16, 26, 12);
    expect(s.boxW).toBe(400 + 32);
    expect(s.boxH).toBe(16 + 26 + 12 + 200 + 16);
  });

  it("contentTop/contentLeft — где класть контент внутри бокса", () => {
    const s = fitSection(400, 200, 16, 26, 12);
    expect(s.contentLeft).toBe(16);
    expect(s.contentTop).toBe(16 + 26 + 12);
  });

  it("заголовок и контент не перекрываются", () => {
    const s = fitSection(400, 200, 16, 26, 12);
    expect(s.contentTop).toBeGreaterThanOrEqual(16 + 26); // хотя бы после заголовка
  });

  it("дефолты — SB_BOX_PAD и SB_HEADER_GAP из общих токенов", () => {
    const s = fitSection(100, 50);
    expect(s.contentLeft).toBe(SB_BOX_PAD);
    expect(s.contentTop).toBe(SB_BOX_PAD + 26 + SB_HEADER_GAP);
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
