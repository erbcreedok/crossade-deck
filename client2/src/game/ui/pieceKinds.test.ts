import { describe, it, expect } from "vitest";
import { pieceVisual } from "./pieceKinds";

// Реестр визуалов по типу — чистая часть (силуэт тени = данные) под тестом. build — VIEW (Pixi), не тестим.
describe("pieceVisual", () => {
  it("фишка: почти круглая тень под ней, масштабируется от r", () => {
    const s = pieceVisual({ kind: "chip", color: 0x111111, denom: "5" }, 10).shadow;
    expect(s.rx).toBeCloseTo(9.8);
    expect(s.ry).toBeCloseTo(8.6);
    expect(s.dy).toBeCloseTo(1.2);
    expect(pieceVisual({ kind: "chip", color: 0, denom: "" }, 20).shadow.rx).toBeCloseTo(19.6);
  });

  it("шахматная фигура: узкий овал у основания (низкая ry, сдвиг вниз)", () => {
    const s = pieceVisual({ kind: "chess", dark: true, glyph: "♞" }, 10).shadow;
    expect(s.ry).toBeLessThan(s.rx); // узкий
    expect(s.dy).toBeGreaterThan(s.ry); // у ножки, смещён вниз
    expect(s.rx).toBeCloseTo(5.6);
    expect(s.ry).toBeCloseTo(1.8);
    expect(s.dy).toBeCloseTo(7);
  });

  it("возвращает функцию отрисовки для каждого типа", () => {
    expect(typeof pieceVisual({ kind: "chip", color: 0, denom: "" }, 8).build).toBe("function");
    expect(typeof pieceVisual({ kind: "chess", dark: false, glyph: "♟" }, 8).build).toBe("function");
  });
});
