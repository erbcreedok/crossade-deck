import { describe, expect, it } from "vitest";
import { buildBoardTree } from "./boardTree";
import { applyCommand, bootState } from "./mock";
import type { BoardSpec } from "./spec";

const rng = () => 0.5;

function spec(over: Partial<BoardSpec> = {}): BoardSpec {
  return {
    id: "t",
    title: "т",
    elements: [
      { kind: "card", id: "c1", face: "6♠" },
      { kind: "card", id: "c2", face: "7♠" },
      { kind: "piece", id: "n1", glyph: "♞", dark: true },
    ],
    zones: [
      { id: "deck", title: "колода", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ["c1", "c2"] } },
      { id: "field", title: "поле", layout: { kind: "grid", cols: 2, rows: 2 }, policy: { onOccupied: "capture" },
        cell: { w: 76, h: 76 }, background: "chessboard", setup: { r0c0: ["n1"] } },
    ],
    seats: { count: { fixed: 2 }, show: "backs", swap: true },
    hand: { reorder: true },
    actions: [],
    ...over,
  };
}

describe("buildBoardTree", () => {
  it("id узлов = SlotKey состояния: фигура находит слот и дом по одному словарю", () => {
    const s = bootState(spec(), 2);
    const tree = buildBoardTree(spec(), s, "p1");
    expect(tree.slotOf("n1")).toBe("field:r0c0");
    expect(tree.homeOf("n1")).not.toBeNull();
    expect(tree.origins["deck:0"]).toBeDefined();
  });

  it("грид отдаёт cellRects под фон, ячейки зоны — своим cell, а не картой", () => {
    const tree = buildBoardTree(spec(), bootState(spec(), 2), "p1");
    const r00 = tree.cellRects["field:r0c0"]!;
    const r11 = tree.cellRects["field:r1c1"]!;
    expect(r00.w).toBe(76);
    expect(r11.x - r00.x).toBe(76);
    expect(r11.y - r00.y).toBe(76);
  });

  it("chain держит пустое звено в конце; после хода звеньев на одно больше", () => {
    const chainSpec = spec({ zones: [
      { id: "deck", title: "к", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ["c1", "c2"] } },
      { id: "chain", title: "ц", layout: { kind: "chain" }, policy: { onOccupied: "merge" } },
    ] });
    let s = bootState(chainSpec, 2);
    const t0 = buildBoardTree(chainSpec, s, "p1");
    expect(t0.origins["chain:0"]).toBeDefined();
    expect(t0.origins["chain:1"]).toBeUndefined();
    s = applyCommand(chainSpec, s, { t: "move", el: "c1", from: "deck:0", to: "chain:0" }, rng);
    const t1 = buildBoardTree(chainSpec, s, "p1");
    expect(t1.slotOf("c1")).toBe("chain:0");
    expect(t1.origins["chain:1"]).toBeDefined(); // новое пустое звено открылось
  });

  it("свои карты — в руке снизу, чужие — в полосе места; у борды без рук руки нет", () => {
    const withDeal = spec({ mock: { deal: { from: "deck", each: 1 } } });
    const s = bootState(withDeal, 2);
    const tree = buildBoardTree(withDeal, s, "p1");
    expect(tree.origins["hand:p1"]).toBeDefined();
    expect(tree.origins["seat:p2"]).toBeDefined();
    expect(tree.origins["seat:p1"]).toBeUndefined(); // себя в полосе нет

    const noHand = spec({ hand: undefined });
    const t2 = buildBoardTree(noHand, bootState(noHand, 2), "p1");
    expect(t2.origins["hand:p1"]).toBeUndefined();
  });

  it("ring раскладывает слоты по окружности с равным удалением от центра", () => {
    const ringSpec = spec({ zones: [
      { id: "track", title: "круг", layout: { kind: "ring", count: 8 }, policy: { onOccupied: "merge" }, cell: { w: 50, h: 50 } },
    ], hand: undefined });
    const tree = buildBoardTree(ringSpec, bootState(ringSpec, 2), "p1");
    const centers = Array.from({ length: 8 }, (_, i) => {
      const r = tree.cellRects[`track:${i}`]!;
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    });
    const cx = centers.reduce((a, c) => a + c.x, 0) / 8;
    const cy = centers.reduce((a, c) => a + c.y, 0) / 8;
    const dists = centers.map((c) => Math.hypot(c.x - cx, c.y - cy));
    for (const d of dists) expect(Math.abs(d - dists[0]!)).toBeLessThan(1e-6);
  });
});
