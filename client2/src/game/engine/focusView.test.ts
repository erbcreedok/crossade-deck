import { describe, expect, it } from "vitest";
import { fitBoundsView } from "./focusView";

// Наведение камеры на границы: центр b → центр доступной области, зум под 90%, зажат в пределы.
const zoom = { min: 0.25, max: 2.5 };

describe("fitBoundsView", () => {
  it("центр границ становится центром доступной области", () => {
    const b = { x: 100, y: 200, w: 300, h: 400 };
    const avail = { w: 800, h: 600 };
    const v = fitBoundsView(b, avail, zoom);
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;
    // screen(центр b) = bc*zoom + view → должен попасть в центр области
    expect(bcx * v.zoom + v.x).toBeCloseTo(avail.w / 2, 6);
    expect(bcy * v.zoom + v.y).toBeCloseTo(avail.h / 2, 6);
  });

  it("зум = 90% вписывания по стеснённой оси", () => {
    // высота стесняет: avail.h/b.h меньше avail.w/b.w
    const v = fitBoundsView({ x: 0, y: 0, w: 200, h: 500 }, { w: 800, h: 600 }, zoom);
    expect(v.zoom).toBeCloseTo(0.9 * (600 / 500), 6);
  });

  it("мелкая зона: зум упирается в max, не улетает за него", () => {
    const v = fitBoundsView({ x: 0, y: 0, w: 20, h: 20 }, { w: 800, h: 600 }, zoom);
    expect(v.zoom).toBe(2.5);
  });

  it("огромная зона: зум упирается в min", () => {
    const v = fitBoundsView({ x: 0, y: 0, w: 100000, h: 100000 }, { w: 800, h: 600 }, zoom);
    expect(v.zoom).toBe(0.25);
  });
});
