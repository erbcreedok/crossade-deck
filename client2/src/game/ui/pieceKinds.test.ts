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

  // Контур по ТИПУ не рисуем: один «контур фигуры вообще» дал бы коню тень пешки. У стоящей
  // фигуры — пятно у основания: оно ничего не изображает и потому не врёт.
  it("шахматная фигура: пятно у основания, видимое из-под глифа", () => {
    const s = pieceVisual({ kind: "chess", dark: true, glyph: "♞" }, 10).shadow;
    expect(s.ry).toBeLessThan(s.rx); // приплюснуто: лежит на столе
    expect(s.dy).toBeGreaterThan(s.ry); // у ножки, а не под центром
    expect(s.rx).toBeGreaterThan(5); // шире прежнего: втрое уже — и его не видно под фигурой
  });

  it("виджет: тень габаритом СВОЕЙ плашки (w/h), r реестра не участвует", () => {
    const s = pieceVisual({ kind: "widget", label: "ГОЛОС", w: 100, h: 50 }, 8).shadow;
    expect(s.rx).toBeCloseTo(48);
    expect(s.ry).toBeCloseTo(20);
    expect(s.ry).toBeLessThan(s.rx); // плашка лежит — тень приплюснута
  });

  it("возвращает функцию отрисовки для каждого типа", () => {
    expect(typeof pieceVisual({ kind: "chip", color: 0, denom: "" }, 8).build).toBe("function");
    expect(typeof pieceVisual({ kind: "chess", dark: false, glyph: "♟" }, 8).build).toBe("function");
    expect(typeof pieceVisual({ kind: "widget", label: "x", w: 10, h: 10 }, 8).build).toBe("function");
  });
});
