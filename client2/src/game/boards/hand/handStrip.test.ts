import { describe, it, expect } from "vitest";
import { handStrip } from "./handStrip";

const CELL = { w: 100, h: 143 };

// Сторож геометрии руки-ряда: центрирование по ширине и ровный нахлёст при переполнении.

describe("handStrip — ряд карт руки, вписанный в ширину", () => {
  it("пустая рука — нет поз", () => {
    expect(handStrip(0, CELL, 800)).toEqual([]);
  });

  it("одна карта — по центру ширины", () => {
    const [p] = handStrip(1, CELL, 800);
    expect(p.x).toBeCloseTo(400, 3);
    expect(p.y).toBeCloseTo(CELL.h / 2, 3);
    expect(p.rot).toBe(0);
  });

  it("ряд влезает — шаг = cell.w + gap, ряд центрирован", () => {
    const gap = 12;
    const poses = handStrip(3, CELL, 800, gap);
    const step = poses[1]!.x - poses[0]!.x;
    expect(step).toBeCloseTo(CELL.w + gap, 3);
    // Центр ряда совпал с центром ширины.
    expect((poses[0]!.x + poses[2]!.x) / 2).toBeCloseTo(400, 3);
  });

  it("переполнение — карты в нахлёст, но КРАЯ ряда в пределах ширины и симметричны", () => {
    const width = 400;
    const poses = handStrip(10, CELL, width);
    const step = poses[1]!.x - poses[0]!.x;
    expect(step).toBeLessThan(CELL.w); // нахлёст
    // Левый край первой карты и правый край последней укладываются в ширину, зеркально.
    const leftEdge = poses[0]!.x - CELL.w / 2;
    const rightEdge = poses[9]!.x + CELL.w / 2;
    expect(leftEdge).toBeCloseTo(0, 3);
    expect(rightEdge).toBeCloseTo(width, 3);
  });
});
