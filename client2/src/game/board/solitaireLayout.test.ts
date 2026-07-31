import { describe, it, expect } from "vitest";
import {
  getSolitaireLayout,
  selectProfile,
  calculateFanPositions,
  type SlotGeometry,
} from "./solitaireLayout";

// Проверка на пересечение прямоугольников (взято из спеки issue #92, локально для теста —
// сама раскладка про пересечения ничего не знает, это инвариант вида, а не геометрии слота).
const doRectsOverlap = (a: SlotGeometry, b: SlotGeometry) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("getSolitaireLayout", () => {
  // Issue #92 в одном месте говорит "14 слотов", но тут же перечисляет ровно 13 ключей
  // (stock, waste, found:S/H/D/C — 4, tab:0..6 — 7 = 13). Явный список ключей — более точный
  // критерий приёмки, чем число в скобках, поэтому берём его: 13 и есть длина набора ключей.
  it("возвращает 13 слотов для мобильного профиля (см. явный список ключей ниже)", () => {
    const layout = getSolitaireLayout(360, 640, "mobile");
    expect(Object.keys(layout)).toHaveLength(13);
  });

  it("набор ключей соответствует ожидаемому: stock/waste/found:*/tab:*", () => {
    const layout = getSolitaireLayout(360, 640, "mobile");
    const expectedKeys = [
      "stock",
      "waste",
      "found:S",
      "found:H",
      "found:D",
      "found:C",
      "tab:0",
      "tab:1",
      "tab:2",
      "tab:3",
      "tab:4",
      "tab:5",
      "tab:6",
    ];
    expect(Object.keys(layout).sort()).toEqual(expectedKeys.sort());
  });

  it("ни одна пара из 14 прямоугольников не пересекается", () => {
    const layout = getSolitaireLayout(360, 640, "mobile");
    const slots = Object.values(layout);
    for (let i = 0; i < slots.length - 1; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(doRectsOverlap(slots[i], slots[j])).toBe(false);
      }
    }
  });

  it("tab:0 использует раскладку 'fan'", () => {
    const layout = getSolitaireLayout(360, 640, "mobile");
    expect(layout["tab:0"].layout).toBe("fan");
  });

  it("waste использует раскладку 'single'", () => {
    const layout = getSolitaireLayout(360, 640, "mobile");
    expect(layout.waste.layout).toBe("single");
  });

  it("stock и фундаменты используют раскладку 'stack'", () => {
    const layout = getSolitaireLayout(360, 640, "mobile");
    expect(layout.stock.layout).toBe("stack");
    expect(layout["found:S"].layout).toBe("stack");
  });
});

describe("selectProfile", () => {
  it("< 600px → mobile", () => {
    expect(selectProfile(360, 640)).toBe("mobile");
  });
  it("< 1024px → tablet", () => {
    expect(selectProfile(800, 600)).toBe("tablet");
  });
  it(">= 1024px → desktop", () => {
    expect(selectProfile(1440, 900)).toBe("desktop");
  });
});

describe("calculateFanPositions", () => {
  it("длина результата равна числу карт", () => {
    const geom = getSolitaireLayout(360, 640, "mobile")["tab:0"];
    const positions = calculateFanPositions(100, 100, 5, geom);
    expect(positions).toHaveLength(5);
  });

  it("не-fan геометрия — все карты в базовой точке, rotation 0", () => {
    const stackGeom: SlotGeometry = { x: 0, y: 0, w: 60, h: 85, layout: "stack" };
    const positions = calculateFanPositions(10, 20, 3, stackGeom);
    expect(positions).toEqual([
      { x: 10, y: 20, rotation: 0 },
      { x: 10, y: 20, rotation: 0 },
      { x: 10, y: 20, rotation: 0 },
    ]);
  });

  it("fan геометрия раскладывает карты по дуге монотонно (позиции различаются)", () => {
    const geom = getSolitaireLayout(360, 640, "mobile")["tab:0"];
    const positions = calculateFanPositions(100, 100, 5, geom);
    expect(positions[0]).not.toEqual(positions[4]);
    // веер идёт от fanStartAngle = 270° (вверх) с раскрытием 60° — карты расходятся вниз по y.
    expect(positions[0].y).toBeLessThan(positions[2].y);
  });

  it("fan геометрия с одной картой не делит на ноль", () => {
    const geom = getSolitaireLayout(360, 640, "mobile")["tab:0"];
    const positions = calculateFanPositions(100, 100, 1, geom);
    expect(positions).toHaveLength(1);
  });
});
