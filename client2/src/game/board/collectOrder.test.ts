import { describe, it, expect } from "vitest";
import { orderSelection, suitOf, type CollectItem } from "./collectOrder";

// Порядок сборки выделенного набора (issue #56). Чистая функция над метаданными карт:
// press (порядок нажатия), rank (номинал), suit (масть), spatial (reading-order: сверху-вниз,
// слева-направо). Движок резолвит «rank-тумблер vs collectOrder» в ОДНУ стратегию и зовёт это.

// Хелпер: собрать item. press — индекс нажатия, x/y — позиция на столе, face — лицо карты.
const it_ = (id: string, press: number, x: number, y: number, face: string): CollectItem => ({ id, press, x, y, face });

describe("collectOrder.suitOf", () => {
  it("масть = последний символ лица", () => {
    expect(suitOf("10♠")).toBe("♠");
    expect(suitOf("A♦")).toBe("♦");
    expect(suitOf("K♣")).toBe("♣");
  });
});

describe("collectOrder.orderSelection", () => {
  // Набор: нажали в порядке Q♠, 6♣, 10♥ (press 0,1,2), лежат вразнобой по x/y.
  const set = (): CollectItem[] => [
    it_("q", 0, 300, 100, "Q♠"), // press 0, справа-сверху
    it_("six", 1, 100, 100, "6♣"), // press 1, слева-сверху
    it_("ten", 2, 200, 300, "10♥"), // press 2, посередине-снизу
  ];

  it("press: строго по порядку нажатия", () => {
    expect(orderSelection(set(), "press")).toEqual(["q", "six", "ten"]);
  });

  it("rank: по возрастанию номинала (6 < 10 < Q)", () => {
    expect(orderSelection(set(), "rank")).toEqual(["six", "ten", "q"]);
  });

  it("suit: по мастям ♣ < ♦ < ♥ < ♠", () => {
    // 6♣(♣) < 10♥(♥) < Q♠(♠)
    expect(orderSelection(set(), "suit")).toEqual(["six", "ten", "q"]);
  });

  it("spatial: reading-order — сверху-вниз, затем слева-направо", () => {
    // верхний ряд (y=100): six(x100) затем q(x300); ниже (y=300): ten
    expect(orderSelection(set(), "spatial")).toEqual(["six", "q", "ten"]);
  });

  it("не мутирует вход", () => {
    const items = set();
    const snapshot = items.map((i) => i.id);
    orderSelection(items, "rank");
    expect(items.map((i) => i.id)).toEqual(snapshot);
  });

  it("устойчивость: равные ключи сохраняют порядок нажатия (tie-break по press)", () => {
    // две карты одной масти ♠ — при suit порядок между ними = порядок нажатия
    const items = [it_("a", 1, 0, 0, "7♠"), it_("b", 0, 0, 0, "K♠")];
    expect(orderSelection(items, "suit")).toEqual(["b", "a"]); // press 0 (b) раньше press 1 (a)
  });

  it("пустой набор → пусто", () => {
    expect(orderSelection([], "press")).toEqual([]);
  });
});
