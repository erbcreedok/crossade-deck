// @vitest-environment jsdom
//
// Сторож: в установленной PWA на iPhone верхняя полоса ОБЯЗАНА опускаться под вырез (чёлку/
// Dynamic Island), а не садиться кнопками ему под низ. Высоту выреза TopBar берёт из safeArea —
// здесь подменяем её и проверяем геометрию. В десктоп-браузере вырез = 0, эффект глазами не
// увидеть, поэтому правило держится этим тестом, а не вниманием.
import { beforeAll, describe, it, expect, vi } from "vitest";

let INSET = 0;
vi.mock("./safeArea", () => ({ safeAreaTop: () => INSET }));

import { TopBar, TOPBAR_H } from "./TopBar";

// jsdom отдаёт canvas без 2d-контекста, а Pixi меряет им подпись (тот же приём, что в Button.disabled).
beforeAll(() => {
  const ctx = {
    font: "",
    measureText: (t: string) => ({ width: t.length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 8 }),
    fillText: () => {},
    clearRect: () => {},
    scale: () => {},
    setTransform: () => {},
    save: () => {},
    restore: () => {},
  };
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  (globalThis as unknown as { CanvasRenderingContext2D: unknown }).CanvasRenderingContext2D = class {
    letterSpacing = "";
  };
});

const bar = () => new TopBar([{ key: "back", label: "← меню" }], "статус");

describe("TopBar: сейф-зона (вырез PWA)", () => {
  it("без выреза высота = TOPBAR_H, кнопка по центру полосы (регресс десктопа)", () => {
    INSET = 0;
    const t = bar();
    t.layout(375);
    expect(t.height).toBe(TOPBAR_H);
    expect(t.midY).toBe(TOPBAR_H / 2);
    expect(t.rects().back!.y).toBe(TOPBAR_H / 2);
  });

  it("с вырезом полоса вырастает на inset, а кнопка опускается ПОД вырез", () => {
    INSET = 47; // чёлка ≈47, Dynamic Island ≈59
    const t = bar();
    t.layout(375);
    expect(t.height).toBe(47 + TOPBAR_H);
    expect(t.midY).toBe(47 + TOPBAR_H / 2);
    // Кнопка стоит НИЖЕ выреза (её центр за пределами сейф-зоны), а не под ним.
    expect(t.rects().back!.y).toBe(47 + TOPBAR_H / 2);
    expect(t.rects().back!.y).toBeGreaterThan(47);
  });

  it("полоса-перехватчик тапа растёт вместе с вырезом", () => {
    INSET = 47;
    const t = bar();
    t.layout(375);
    expect(t.contains(47 + TOPBAR_H)).toBe(true); // низ полосы — ещё панель
    expect(t.contains(47 + TOPBAR_H + 1)).toBe(false); // ниже — уже стол
  });
});
