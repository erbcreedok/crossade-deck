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

  // У фигуры форма СВОЯ, а не овал: овал у основания прятался под глифом, и тени будто не было.
  it("шахматная фигура: собственный силуэт, габарит по самой фигуре", () => {
    const v = pieceVisual({ kind: "chess", dark: true, glyph: "♞" }, 10);
    expect(v.silhouette, "у фигуры есть свой контур").toBeDefined();
    expect(v.silhouette![0]!.length % 2, "контур — пары координат").toBe(0);
    expect(v.shadow.rx).toBeCloseTo(6.2); // уже фигуры по горизонтали
    expect(v.shadow.ry).toBeCloseTo(10); // но во всю её высоту: тень повторяет предмет
    expect(v.shadow.dy).toBeCloseTo(6.2); // сдвиг к ОСНОВАНИЮ: приплюснутый силуэт стоит подошвой там же
    expect(v.flatten, "тень стоящей фигуры лежит на столе, а не висит копией").toBeLessThan(1);
  });

  it("круглой фишке своя форма не нужна — эллипс и есть её силуэт", () => {
    expect(pieceVisual({ kind: "chip", color: 0, denom: "" }, 10).silhouette).toBeUndefined();
  });

  it("возвращает функцию отрисовки для каждого типа", () => {
    expect(typeof pieceVisual({ kind: "chip", color: 0, denom: "" }, 8).build).toBe("function");
    expect(typeof pieceVisual({ kind: "chess", dark: false, glyph: "♟" }, 8).build).toBe("function");
  });
});
