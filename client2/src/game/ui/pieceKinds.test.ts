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

  // Форму тени НЕ рисуем по типу: контур снимается с самого визуала (Piece.setSilhouette). Здесь
  // тип задаёт только габарит и то, насколько тень приплюснута — стоящая фигура кладёт её на стол.
  it("шахматная фигура: тень во всю фигуру и приплюснута — она лежит на столе", () => {
    const v = pieceVisual({ kind: "chess", dark: true, glyph: "♞" }, 10);
    expect(v.shadow.rx).toBeCloseTo(6.2); // уже фигуры по горизонтали
    expect(v.shadow.ry).toBeCloseTo(12.5); // во всю её высоту вместе с головой
    expect(v.shadow.dy).toBeCloseTo(6.2); // к ОСНОВАНИЮ: приплюснутая тень стоит там же, где фигура
    expect(v.flatten, "тень стоящей фигуры лежит на столе, а не висит копией").toBeLessThan(1);
  });

  it("лежащая фишка не плющится: её тень — она сама", () => {
    expect(pieceVisual({ kind: "chip", color: 0, denom: "" }, 10).flatten ?? 1).toBe(1);
  });

  it("возвращает функцию отрисовки для каждого типа", () => {
    expect(typeof pieceVisual({ kind: "chip", color: 0, denom: "" }, 8).build).toBe("function");
    expect(typeof pieceVisual({ kind: "chess", dark: false, glyph: "♟" }, 8).build).toBe("function");
  });
});
