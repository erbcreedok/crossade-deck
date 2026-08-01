import { describe, it, expect } from "vitest";
import { fitBox, fitText } from "./boxFit";

const PRESET = { w: 120, h: 40 };

describe("fitBox", () => {
  it("preset — габарит пресета, текст не влияет", () => {
    expect(fitBox({ preset: PRESET, text: { w: 999, h: 999 } })).toEqual({ w: 120, h: 40 });
  });

  it("content — габарит от текста плюс поля", () => {
    expect(fitBox({ preset: PRESET, text: { w: 200, h: 20 }, fit: "content", padding: 10 })).toEqual({ w: 220, h: 30 });
  });

  it("явные width/height перебивают и пресет, и content", () => {
    expect(fitBox({ preset: PRESET, text: { w: 200, h: 20 }, fit: "content", width: 50, height: 60 })).toEqual({ w: 50, h: 60 });
  });

  // Ради этого границы и ставят: «не шире отведённого места» должно действовать ВСЕГДА, иначе
  // явная ширина тихо вылезает за макет.
  it("границы применяются ПОСЛЕДНИМИ — в том числе к явной ширине", () => {
    expect(fitBox({ preset: PRESET, text: { w: 0, h: 0 }, width: 500, maxWidth: 200 }).w).toBe(200);
    expect(fitBox({ preset: PRESET, text: { w: 0, h: 0 }, width: 10, minWidth: 80 }).w).toBe(80);
  });

  it("границы действуют и на content-fit", () => {
    expect(fitBox({ preset: PRESET, text: { w: 400, h: 20 }, fit: "content", padding: 8, maxWidth: 150 }).w).toBe(150);
  });
});

describe("fitText", () => {
  const box = { w: 100, h: 40 };

  it("влезает — масштаб 1, ничего не трогаем", () => {
    expect(fitText({ box, text: { w: 50, h: 20 }, padding: 8 })).toBe(1);
  });

  it("не влезает — ужимаем (по умолчанию включено)", () => {
    // Вылезший за коробку текст — поломка, а не решение, поэтому ужатие идёт само.
    expect(fitText({ box, text: { w: 200, h: 20 }, padding: 8 })).toBeCloseTo(84 / 200);
  });

  it("ужатие можно выключить — тогда текст честно вылезает", () => {
    expect(fitText({ box, text: { w: 200, h: 20 }, padding: 8, shrink: false })).toBe(1);
  });

  it("растяжение по умолчанию ВЫКЛЮЧЕНО: выросшая подпись ломает ряд одинаковых кнопок", () => {
    expect(fitText({ box, text: { w: 10, h: 5 }, padding: 8 })).toBe(1);
    expect(fitText({ box, text: { w: 10, h: 5 }, padding: 8, grow: true })).toBeGreaterThan(1);
  });

  it("ось решает, что считать «влезает»", () => {
    // Широкий и низкий текст: по ширине не влезает, по высоте — с запасом.
    const text = { w: 200, h: 5 };
    expect(fitText({ box, text, padding: 8, axis: "horizontal" })).toBeCloseTo(84 / 200);
    expect(fitText({ box, text, padding: 8, axis: "vertical", grow: true })).toBeCloseTo(32 / 5);
    // both — меньший из двух: подпись гарантированно внутри.
    expect(fitText({ box, text, padding: 8, axis: "both" })).toBeCloseTo(84 / 200);
  });

  it("есть пол масштаба: лучше пусть вылезет заметно, чем незаметно исчезнет", () => {
    expect(fitText({ box, text: { w: 100000, h: 20 }, padding: 8 })).toBe(0.3);
  });

  it("shrink + grow + both = полный адаптив: подпись всегда ровно по коробке", () => {
    const opts = { box, padding: 8, shrink: true, grow: true, axis: "both" as const };
    expect(fitText({ ...opts, text: { w: 200, h: 20 } })).toBeLessThan(1);
    expect(fitText({ ...opts, text: { w: 20, h: 5 } })).toBeGreaterThan(1);
  });
});
