import { describe, it, expect } from "vitest";
import { frontierCells, dynamicSlots } from "./dynamicGrid";

// Динамический грид: растёт в ЛЮБУЮ сторону. Фронтир — пустые ячейки, соседние занятым (куда можно
// поставить и грид подрастёт). Раскладка ре-центрируется по текущей рамке контента. Чисто.
describe("frontierCells", () => {
  it("пустой грид → одна стартовая ячейка 0,0", () => {
    expect(frontierCells([])).toEqual(["0,0"]);
  });
  it("одна занятая → 4 соседа (рост в любую сторону)", () => {
    expect(frontierCells(["0,0"]).sort()).toEqual(["-1,0", "0,-1", "0,1", "1,0"].sort());
  });
  it("две занятые → соседи обеих минус занятые, без дублей", () => {
    const f = frontierCells(["0,0", "0,1"]).sort();
    expect(f).toEqual(["-1,0", "-1,1", "0,-1", "0,2", "1,0", "1,1"].sort());
    expect(f).not.toContain("0,0");
    expect(f).not.toContain("0,1");
  });
});

describe("dynamicSlots", () => {
  const geom = { cell: { w: 100, h: 100 }, gap: 0, origin: { x: 10, y: 20 } };
  it("ре-центрирует по минимальным r,c (рост влево/вверх сдвигает контент)", () => {
    const s = dynamicSlots(["0,0", "1,0"], geom);
    const at = (k: string) => s.find((x) => x.key === k)!;
    expect(at("0,0").rect).toEqual({ x: 10, y: 20, w: 100, h: 100 });
    expect(at("1,0").rect).toEqual({ x: 10, y: 120, w: 100, h: 100 });
  });
  it("отрицательные координаты нормализуются к origin", () => {
    const s = dynamicSlots(["-1,-2", "0,0"], geom);
    const at = (k: string) => s.find((x) => x.key === k)!;
    expect(at("-1,-2").rect).toEqual({ x: 10, y: 20, w: 100, h: 100 }); // мин → origin
    expect(at("0,0").center).toEqual({ x: 10 + 200 + 50, y: 20 + 100 + 50 }); // +2 колонки, +1 строка
  });
});
