import { describe, expect, it } from "vitest";
import type { Snapshot } from "../src/table/contract.js";
import { clusters, markNear, marksOf } from "./replayMarks.js";
import type { Told } from "./replayStore.js";

// Стол: крупье на c1, игроки на c2 и c3, круг хода пуст.
const start = (): Snapshot =>
  ({
    v: 0,
    people: [{ key: "bot:k", name: "Крупье" }, { key: "tg:1", name: "Ye" }, { key: "tg:2", name: "Бо" }],
    chairs: [
      { id: "c1", angle: 0, owner: "bot:k", croupier: true, hide: true, hand: [], pose: {} },
      { id: "c2", angle: 120, owner: "tg:1", hide: true, hand: [{ id: "a" }, { id: "b" }], pose: {} },
      { id: "c3", angle: 240, owner: "tg:2", hide: true, hand: [{ id: "c" }], pose: {} },
    ],
    piles: [{ id: "deck", cards: [], shuffles: 0 }, { id: "ring", cards: [], shuffles: 0 }],
    felt: [],
    trails: {},
    locks: {},
    picks: {},
    rules: {},
    admin: null,
    dealer: null,
    rights: [],
    play: null,
  }) as unknown as Snapshot;
let n = 0;
let v = 0;
const d = (at: number, kind: string, what?: unknown, who?: string, side: Told["side"] = "table"): Told => ({ id: ++n, at, side, kind, ...(who ? { who } : {}), ...(what === undefined ? {} : { what }) });
const patch = (at: number, ops: unknown[]) => d(at, "patch", { v: ++v, ops });
const lay = (id: string, chair: string, by: string, name: string) => ({ t: "move", card: { id }, from: { in: "hand", chair, i: 0 }, to: { in: "deck", pile: "ring" }, trail: { by, byName: name, from: "hand" } });
const sweep = (id: string, by: string, name: string) => ({ t: "move", card: { id }, from: { in: "deck", pile: "ring" }, to: { in: "hand", chair: "c1", i: 0 }, trail: { by, byName: name, from: "deck" } });

describe("replayMarks.confirmed-only", () => {
  const log = [
    patch(0, [{ t: "dealt", by: "bot:k", byName: "Крупье", parts: [] }]),
    d(10, "match", { идёт: true, ход: "c2", закрыл: null, порог: 0, вышли: [] }),
    patch(20, [lay("a", "c2", "tg:1", "Ye")]),
    d(21, "match", { идёт: true, ход: "c3", закрыл: null, порог: 2, вышли: [] }),
    patch(30, [lay("c", "c3", "tg:2", "Бо")]),
    d(31, "match", { идёт: true, ход: "c2", закрыл: "c3", порог: 0, вышли: [] }),
    d(32, "view", { x: 0 }, "tg:1", "screen"),
    patch(40, [sweep("a", "bot:k", "Крупье")]),
    patch(41, [sweep("c", "bot:k", "Крупье")]),
    d(42, "match", { идёт: true, ход: "c2", закрыл: "c3", порог: 0, вышли: [] }),
    patch(50, [lay("b", "c2", "tg:1", "Ye")]),
    d(51, "match", { идёт: true, ход: null, закрыл: "c3", порог: 0, вышли: ["c3"] }),
  ];

  it("раздача, закрытие, сбор и конец — каждое на своём мгновении, закрытие и сбор раздельно", () => {
    const marks = marksOf(log, start());
    expect(marks.map((m) => [m.kind, m.step, m.says])).toEqual([
      ["deal", 0, "Крупье раздал"],
      ["close", 5, "Круг закрыл Бо"],
      ["sweep", 7, "Крупье собрал круг"],
      ["end", 11, "Партия окончена"],
    ]);
  });

  it("порог ноль при пустом круге — новый круг, а не закрытие", () => {
    expect(marksOf(log, start()).filter((m) => m.kind === "close")).toHaveLength(1);
  });

  it("сбор руками человека — так и сказано; карта из круга себе в руку — не сбор", () => {
    const own = [patch(0, [lay("a", "c2", "tg:1", "Ye")]), patch(1, [sweep("a", "tg:1", "Ye")]), patch(2, [{ ...sweep("c", "tg:2", "Бо"), from: { in: "hand", chair: "c3", i: 0 } }])];
    const taken = [patch(0, [lay("a", "c2", "tg:1", "Ye")]), patch(1, [{ ...sweep("a", "tg:2", "Бо"), to: { in: "hand", chair: "c3", i: 0 } }])];
    expect(marksOf(own, start()).map((m) => m.says)).toEqual(["Ye собрал круг крупье"]);
    expect(marksOf(taken, start())).toEqual([]);
  });

  it("обрезанный ход меток не даёт — они не придумываются", () => {
    expect(marksOf([d(0, "patch", { v: 1 }), d(1, "view", {}, "tg:1", "screen")], start())).toEqual([]);
  });
});

describe("replayMarks.navigation", () => {
  const marks = [5, 9, 30, 31, 32, 90].map((step) => ({ step, at: step, kind: "close" as const, says: "" }));
  it("к прошлому и следующему важному — мимо текущего", () => {
    expect(markNear(marks, 9, 1)?.step).toBe(30);
    expect(markNear(marks, 9, -1)?.step).toBe(5);
    expect(markNear(marks, 90, 1)).toBeNull();
    expect(markNear(marks, 5, -1)).toBeNull();
  });
  it("тесные метки — одной группой", () => {
    expect(clusters(marks, 100, 0.03).map((g) => g.map((m) => m.step))).toEqual([[5], [9], [30, 31, 32], [90]]);
  });
});
