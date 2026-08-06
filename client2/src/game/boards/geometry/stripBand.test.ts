import { describe, expect, it } from "vitest";
import { buildBoardTree } from "./boardTree";
import { initialState } from "../core/state";
import type { BoardSpec } from "../core/spec";

// Сторож видов ЧУЖОЙ ленты (правило владельца): на борде — та ЖЕ полноценная полоса, что у
// владельца, только УЖАТАЯ (стол один для всех); зона в HUD владельца — МИНИ-ВИЗАВИ у его
// аватара (мельче, зеркальный порядок, место — atSeat). Ключи реальные — дроп той же дверью.

function spec(over: Partial<BoardSpec> = {}): BoardSpec {
  return {
    id: "t",
    title: "",
    elements: Array.from({ length: 6 }, (_, i) => ({ kind: "card", id: `c${i + 1}`, face: "6♠" })),
    zones: [
      { id: "deck", title: "", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
      { id: "hand", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" },
        setup: { p1: ["c1", "c2"], p2: ["c3", "c4", "c5"] } },
    ],
    seats: { count: { fixed: 2 }, show: "backs", swap: true },
    actions: [],
    ...over,
  };
}

describe("чужая лента: полная-ужатая на борде, мини-визави при HUD владельца", () => {
  it("на борде: чужая полоса — тот же ряд-лента (не кучка), ужатая относительно своей", () => {
    const sp = spec();
    const tree = buildBoardTree(sp, initialState(sp, 2), "p1");
    const own = tree.homeOf("c1")!;
    const foreign = tree.homeOf("c3")!;
    expect(tree.slotOf("c3")).toBe("hand:p2");
    expect(tree.cellRects["hand:p2"]).toBeDefined(); // band чужой ленты — в cellRects (rest/armed)
    // Ужатие: шаг свободного ряда чужой ленты меньше своего (ячейка 0.7).
    const stepF = tree.homeOf("c4")!.x - foreign.x;
    expect(stepF).toBeGreaterThan(0);
    expect(own.y).toBeGreaterThan(foreign.y); // своя — внизу, чужая — у места сверху
  });

  it("зона в HUD: чужая — мини (мельче ужатой) и ЗЕРКАЛЬНАЯ (первая карта владельца справа)", () => {
    const board = spec();
    const docked = spec({ hud: { areas: [{ place: { region: { side: "bottom", slot: "start" } }, widgets: [{ kind: "zone", zone: "hand" }] }] } });
    const tBoard = buildBoardTree(board, initialState(board, 2), "p1");
    const tMini = buildBoardTree(docked, initialState(docked, 2), "p1");
    // Мини мельче ужатой: band ниже.
    expect(tMini.cellRects["hand:p2"]!.h).toBeLessThan(tBoard.cellRects["hand:p2"]!.h);
    // Зеркало: c3 (первая владельца) в мини-виде ПРАВЕЕ c5; на борде — левее.
    expect(tBoard.homeOf("c3")!.x).toBeLessThan(tBoard.homeOf("c5")!.x);
    expect(tMini.homeOf("c3")!.x).toBeGreaterThan(tMini.homeOf("c5")!.x);
  });

  it("atSeat: above кладёт мини-ленту выше below (круглый стол, реальные направления)", () => {
    const mk = (atSeat: "above" | "below"): BoardSpec =>
      spec({
        zones: [
          { id: "board", title: "", layout: { kind: "free" }, cell: { w: 400, h: 400 }, policy: { onOccupied: "merge" } },
          { id: "place", title: "", layout: { kind: "seats" }, policy: { onOccupied: "reject" } },
          { id: "hand", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" }, atSeat,
            setup: { p2: ["c3"] } },
        ],
        hud: { areas: [{ place: { region: { side: "bottom", slot: "start" } }, widgets: [{ kind: "zone", zone: "hand" }] }] },
      });
    const above = buildBoardTree(mk("above"), initialState(mk("above"), 2), "p1");
    const below = buildBoardTree(mk("below"), initialState(mk("below"), 2), "p1");
    expect(above.cellRects["hand:p2"]!.y).toBeLessThan(below.cellRects["hand:p2"]!.y);
  });
});
