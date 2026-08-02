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

  it("возвращает функцию отрисовки для каждого типа", () => {
    expect(typeof pieceVisual({ kind: "chip", color: 0, denom: "" }, 8).build).toBe("function");
    expect(typeof pieceVisual({ kind: "chess", dark: false, glyph: "♟" }, 8).build).toBe("function");
  });
});
