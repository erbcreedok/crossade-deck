// ПЕРЕВОРОТ ВТОРЫМ ПАЛЬЦЕМ: мёртвая зона, угол за пальцем, щелчок на пороге, после щелчка палец не важен.

import { describe, expect, it } from "vitest";
import { CardFlip, FLIP } from "./cardFlip.js";

const pxFor = (deg: number) => FLIP.dead + (deg / 180) * FLIP.span;

describe("CardFlip", () => {
  it("мёртвая зона: дрожание пальца карту не крутит", () => {
    const f = new CardFlip(); f.begin(100);
    expect(f.move(100 + FLIP.dead)).toEqual({ angle: 0, click: false });
    expect(f.move(100 - FLIP.dead + 1)).toEqual({ angle: 0, click: false });
  });
  it("угол идёт за пальцем, знак — куда повёл", () => {
    const f = new CardFlip(); f.begin(100);
    expect(f.move(100 + pxFor(45)).angle).toBeCloseTo(45, 5);
    expect(f.move(100 - pxFor(60)).angle).toBeCloseTo(-60, 5);
    expect(f.clicked).toBe(false);
  });
  it("ниже порога вернул палец — переворота нет", () => {
    const f = new CardFlip(); f.begin(0);
    f.move(pxFor(FLIP.click - 5));
    expect(f.move(0).angle).toBe(0);
    expect(f.clicked).toBe(false);
  });
  it("на пороге щёлкает один раз, дальше палец не важен", () => {
    const f = new CardFlip(); f.begin(0);
    const r = f.move(pxFor(FLIP.click + 1));
    expect(r.click).toBe(true);
    expect(f.clicked).toBe(true);
    expect(f.move(pxFor(180))).toEqual({ angle: 0, click: false });
    expect(f.move(0)).toEqual({ angle: 0, click: false });
    expect(f.clicked).toBe(true);
  });
  it("щёлкает в обе стороны", () => {
    const f = new CardFlip(); f.begin(500);
    expect(f.move(500 - pxFor(FLIP.click + 1)).click).toBe(true);
  });
  it("новый второй палец — новый жест", () => {
    const f = new CardFlip(); f.begin(0); f.move(pxFor(170));
    f.begin(0);
    expect(f.clicked).toBe(false);
    expect(f.move(pxFor(30)).angle).toBeCloseTo(30, 5);
  });
});
