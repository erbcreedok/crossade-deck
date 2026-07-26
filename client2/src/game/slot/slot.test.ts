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
    group("grid", grid({ cols: { min: 3 }, gap: 0 }), [leaf("gd", "d", CARD), leaf("ge", "e", CARD)], { reorder: { enabled: true }, drop: {} }),
  ], { drop: {} });

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

describe("slot: gap (призрачная карта — дыра под падающую)", () => {
  const row = () => group("row", linear({ axis: "x", gap: 0 }), [leaf("la", "a", { w: 100, h: 100 }), leaf("lb", "b", { w: 100, h: 100 }), leaf("lc", "c", { w: 100, h: 100 })]);
  it("дыра на индексе 1 → соседи справа раздвигаются, габарит растёт", () => {
    const g = row();
    g.gap = { index: 1, size: { w: 100, h: 100 } };
    expect(homeOf(g, "a")).toEqual({ x: 50, y: 50 }); // слот 0
    expect(homeOf(g, "b")).toEqual({ x: 250, y: 50 }); // сдвинут на слот 2 (дыра — слот 1)
    expect(homeOf(g, "c")).toEqual({ x: 350, y: 50 }); // слот 3
    expect(measure(g)).toEqual({ w: 400, h: 100 }); // 4 слота (3 карты + дыра)
  });
  it("skip — перетаскиваемая исключена из раскладки, её дом = null", () => {
    const g = row();
    g.gap = { index: 1, size: { w: 100, h: 100 }, skip: "b" };
    expect(homeOf(g, "b")).toBeNull(); // тащат — из раскладки убрана
    expect(homeOf(g, "a")).toEqual({ x: 50, y: 50 }); // слот 0
    expect(homeOf(g, "c")).toEqual({ x: 250, y: 50 }); // слот 2 (a + дыра + c)
    expect(measure(g)).toEqual({ w: 300, h: 100 }); // 2 карты + дыра = 3 слота
  });
  it("без gap — обычная раскладка", () => {
    const g = row();
    expect(homeOf(g, "b")).toEqual({ x: 150, y: 50 });
    expect(measure(g)).toEqual({ w: 300, h: 100 });
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

  it("DropZone.pad расширяет зону попадания: точка в отступе слева всё равно попадает в грид", () => {
    const f = group("field", absolute([{ x: 0, y: 0 }, { x: 200, y: 0 }]), [
      group("deck", linear({ gap: -90 }), [leaf("da", "a", CARD)]),
      group("grid", grid({ cols: { min: 3 }, gap: 0 }), [leaf("gd", "d", CARD)], { drop: { pad: 20 } }),
    ], { drop: {} });
    // грид bbox x∈[200,500]; точка x=190 ВНЕ него, но в pad 20 (180..520) — цель всё равно грид.
    expect(dropTarget(f, { x: 190, y: 70 })?.group.id).toBe("grid");
    // без pad та же точка ушла бы во внешнее Поле (демонстрация, что решает именно pad):
    const noPad = group("field", absolute([{ x: 200, y: 0 }]), [
      group("grid", grid({ cols: { min: 3 }, gap: 0 }), [leaf("gd", "d", CARD)], { drop: {} }),
    ], { drop: {} });
    expect(dropTarget(noPad, { x: 190, y: 70 })?.group.id).toBe("field");
  });
});
