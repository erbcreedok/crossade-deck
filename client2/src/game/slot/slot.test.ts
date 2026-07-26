import { describe, it, expect } from "vitest";
import { leaf, group, type Size } from "./types";
import { linear, grid, absolute } from "./layouts";
import { measure, figures, has, homeOf, pathTo, dropTarget } from "./slot";

const CARD: Size = { w: 100, h: 140 };

// Поле = группа(absolute)[ колода=группа(linear-нахлёст), грид=группа(grid, reorder+dropzone) ].
// Ровно та рекурсия, что заменит Field: разные контейнеры = разные Layout над одним деревом.
const buildField = () =>
  group("field", absolute([{ x: 0, y: 0 }, { x: 200, y: 0 }]), [
    group("deck", linear({ gap: -90 }), [leaf("da", "a", CARD), leaf("db", "b", CARD), leaf("dc", "c", CARD)]),
    group("grid", grid({ minCols: 3, gap: 0 }), [leaf("gd", "d", CARD), leaf("ge", "e", CARD)], { reorder: true, dropZone: true }),
  ], { dropZone: true });

describe("slot: чтения", () => {
  it("measure — габарит вытекает из дерева снизу вверх", () => {
    expect(measure(buildField())).toEqual({ w: 500, h: 140 }); // колода 120 @0 + грид 300 @200
  });
  it("figures — все фигуры поддерева по порядку", () => {
    expect(figures(buildField())).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("has", () => {
    const f = buildField();
    expect(has(f, "d")).toBe(true);
    expect(has(f, "zzz")).toBe(false);
  });
  it("homeOf — абсолютный центр листа, смещения копятся по пути", () => {
    const f = buildField();
    expect(homeOf(f, "a")).toEqual({ x: 50, y: 70 }); // колода @0, стаггер 0
    expect(homeOf(f, "b")).toEqual({ x: 60, y: 70 }); // стаггер +10
    expect(homeOf(f, "d")).toEqual({ x: 250, y: 70 }); // грид @200, ячейка 0
    expect(homeOf(f, "e")).toEqual({ x: 350, y: 70 }); // грид ячейка 1
    expect(homeOf(f, "zzz")).toBeNull();
  });
  it("pathTo — путь индексов корень→лист", () => {
    const f = buildField();
    expect(pathTo(f, "a")).toEqual([0, 0]);
    expect(pathTo(f, "e")).toEqual([1, 1]);
    expect(pathTo(f, "zzz")).toBeNull();
  });
});

describe("slot: dropTarget (глубочайшая дропзона под точкой)", () => {
  it("над гридом → сам грид + индекс ячейки", () => {
    const t = dropTarget(buildField(), { x: 250, y: 70 });
    expect(t?.group.id).toBe("grid");
    expect(t?.index).toBe(0);
  });
  it("над колодой (не дропзона) → внешнее Поле", () => {
    const t = dropTarget(buildField(), { x: 60, y: 70 });
    expect(t?.group.id).toBe("field");
  });
  it("совсем мимо дерева → всё равно внешняя дропзона Поля (индекс по краю)", () => {
    const t = dropTarget(buildField(), { x: 9999, y: 9999 });
    expect(t?.group.id).toBe("field");
  });
});
