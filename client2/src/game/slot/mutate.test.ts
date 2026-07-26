import { describe, it, expect } from "vitest";
import { leaf, group, type Caps, type Group, type Size } from "./types";
import { linear, grid, absolute } from "./layouts";
import { figures, homeOf } from "./slot";
import { reorderChildren, detach, dropInto } from "./mutate";

const CARD: Size = { w: 100, h: 140 };

// Поле: колода @0 + грид @200 (абсолют — предсказуемые точки для дропа). Способности грида — через caps.
const field = (gridCaps: Caps = { reorder: { enabled: true }, drop: {} }) =>
  group("field", absolute([{ x: 0, y: 0 }, { x: 200, y: 0 }]), [
    group("deck", linear({ gap: -90 }), [leaf("da", "a", CARD), leaf("db", "b", CARD), leaf("dc", "c", CARD)]),
    group("grid", grid({ cols: { min: 3 }, gap: 0 }), [leaf("gd", "d", CARD), leaf("ge", "e", CARD)], gridCaps),
  ], { drop: {} });

const gridOf = (f: ReturnType<typeof field>) => f.children[1] as Group;
const figuresOfGrid = (f: ReturnType<typeof field>) => figures(gridOf(f));

describe("reorderChildren", () => {
  it("переставляет ребёнка from→to", () => {
    const g = group("g", grid({ cols: { min: 3 } }), [leaf("a", "a", CARD), leaf("b", "b", CARD), leaf("c", "c", CARD)]);
    expect(reorderChildren(g, 2, 0)).toBe(true);
    expect(figures(g)).toEqual(["c", "a", "b"]);
  });
  it("from===to → false, дерево не тронуто", () => {
    const g = group("g", grid({ cols: { min: 3 } }), [leaf("a", "a", CARD), leaf("b", "b", CARD)]);
    expect(reorderChildren(g, 1, 1)).toBe(false);
    expect(figures(g)).toEqual(["a", "b"]);
  });
});

describe("detach", () => {
  it("вынимает лист с фигурой из вложенной группы", () => {
    const f = field();
    const l = detach(f, "b");
    expect(l?.figure).toBe("b");
    expect(figures(f)).toEqual(["a", "c", "d", "e"]);
  });
});

describe("dropInto", () => {
  it("перенос из колоды в грид по позиции дропа", () => {
    const f = field();
    const r = dropInto(f, "a", { x: 250, y: 70 }); // ячейка 0 грида
    expect(r).toEqual({ moved: true, reordered: false });
    expect(figuresOfGrid(f)).toEqual(["a", "d", "e"]); // вставилась в начало
    expect(figures(f.children[0]!)).toEqual(["b", "c"]); // ушла из колоды
    expect(homeOf(f, "a")).toEqual({ x: 250, y: 70 }); // дом обновился
  });

  it("реордер внутри грида по позиции", () => {
    const f = field();
    const r = dropInto(f, "e", { x: 250, y: 70 }); // e (индекс 1) на ячейку 0
    expect(r).toEqual({ moved: true, reordered: true });
    expect(figuresOfGrid(f)).toEqual(["e", "d"]);
  });

  it("реордер выключен (нет способности) → фигура остаётся на месте", () => {
    const f = field({ drop: {} });
    const r = dropInto(f, "e", { x: 250, y: 70 });
    expect(r.moved).toBe(false);
    expect(figuresOfGrid(f)).toEqual(["d", "e"]);
  });

  it("cap (в способности drop) — полная зона не принимает перенос", () => {
    const f = field({ reorder: { enabled: true }, drop: { cap: 2 } });
    const r = dropInto(f, "a", { x: 250, y: 70 });
    expect(r.moved).toBe(false);
    expect(figuresOfGrid(f)).toEqual(["d", "e"]);
  });

  it("accept (в способности drop) — зона отвергает неподходящую фигуру", () => {
    const f = field({ reorder: { enabled: true }, drop: { accept: (fig: string) => fig !== "a" } });
    expect(dropInto(f, "a", { x: 250, y: 70 }).moved).toBe(false);
    expect(dropInto(f, "b", { x: 250, y: 70 }).moved).toBe(true);
  });
});
