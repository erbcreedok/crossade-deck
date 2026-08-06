import { describe, it, expect } from "vitest";
import { stripRow, stripRowWithGap, stripCellSize } from "./row";

const CELL = { w: 100, h: 143 };

// Сторож геометрии руки-ряда: центрирование по ширине и ровный нахлёст при переполнении.

describe("stripRow — ряд карт руки, вписанный в ширину", () => {
  it("пустая рука — нет поз", () => {
    expect(stripRow(0, CELL, 800)).toEqual([]);
  });

  it("одна карта — по центру ширины", () => {
    const [p] = stripRow(1, CELL, 800);
    expect(p.x).toBeCloseTo(400, 3);
    expect(p.y).toBeCloseTo(CELL.h / 2, 3);
    expect(p.rot).toBe(0);
  });

  it("ряд влезает — шаг = cell.w + gap, ряд центрирован", () => {
    const gap = 12;
    const poses = stripRow(3, CELL, 800, gap);
    const step = poses[1]!.x - poses[0]!.x;
    expect(step).toBeCloseTo(CELL.w + gap, 3);
    // Центр ряда совпал с центром ширины.
    expect((poses[0]!.x + poses[2]!.x) / 2).toBeCloseTo(400, 3);
  });

  it("переполнение — карты в нахлёст, но КРАЯ ряда в пределах ширины и симметричны", () => {
    const width = 400;
    const poses = stripRow(10, CELL, width);
    const step = poses[1]!.x - poses[0]!.x;
    expect(step).toBeLessThan(CELL.w); // нахлёст
    // Левый край первой карты и правый край последней укладываются в ширину, зеркально.
    const leftEdge = poses[0]!.x - CELL.w / 2;
    const rightEdge = poses[9]!.x + CELL.w / 2;
    expect(leftEdge).toBeCloseTo(0, 3);
    expect(rightEdge).toBeCloseTo(width, 3);
  });
});

describe("stripRowWithGap — гэп-превью вставки (груз навис над рукой)", () => {
  it("карты занимают позиции ряда count+1, позиция gapIndex пустует", () => {
    const gapped = stripRowWithGap(3, 1, CELL, 800);
    const full = stripRow(4, CELL, 800);
    expect(gapped.length).toBe(3);
    // Карта 0 — на позиции 0, карты 1..2 сдвинуты на позиции 2..3: гэп открыт под индексом 1.
    expect(gapped.map((p) => p.x)).toEqual([full[0]!.x, full[2]!.x, full[3]!.x]);
  });

  it("гэп с краёв: 0 — все карты уехали вправо; count — влево (позиции без первой/последней)", () => {
    const full = stripRow(4, CELL, 800);
    expect(stripRowWithGap(3, 0, CELL, 800).map((p) => p.x)).toEqual(full.slice(1).map((p) => p.x));
    expect(stripRowWithGap(3, 3, CELL, 800).map((p) => p.x)).toEqual(full.slice(0, 3).map((p) => p.x));
  });

  it("gapIndex за пределами — зажимается в [0..count], а не роняет раскладку", () => {
    expect(stripRowWithGap(3, 99, CELL, 800)).toEqual(stripRowWithGap(3, 3, CELL, 800));
    expect(stripRowWithGap(3, -5, CELL, 800)).toEqual(stripRowWithGap(3, 0, CELL, 800));
  });
});

describe("stripCellSize — адаптивный размер карты руки под экран", () => {
  it("аспект карты сохраняется (h/w == cell)", () => {
    const s = stripCellSize(360, 800, CELL);
    expect(s.h / s.w).toBeCloseTo(CELL.h / CELL.w, 5);
  });

  it("узкий телефон даёт карту МЕЛЬЧЕ, чем широкий десктоп той же высоты", () => {
    const phone = stripCellSize(360, 800, CELL);
    const desktop = stripCellSize(1400, 800, CELL);
    expect(phone.w).toBeLessThan(desktop.w);
  });

  it("на высоком узком телефоне рост ограничивает ширина (не 0.2·высоты)", () => {
    const phone = stripCellSize(360, 850, CELL);
    // 360/HAND_FIT(5) = 72 по ширине против 0.2*850/аспект ≈ 119 по высоте → берётся ширина.
    expect(phone.w).toBeCloseTo(72, 0);
  });

  it("пределы: не крупнее W_MAX и не мельче W_MIN", () => {
    expect(stripCellSize(100000, 100000, CELL).w).toBeLessThanOrEqual(120);
    expect(stripCellSize(1, 1, CELL).w).toBeGreaterThanOrEqual(48);
  });
});
