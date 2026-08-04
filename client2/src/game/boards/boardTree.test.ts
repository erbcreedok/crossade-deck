import { describe, expect, it } from "vitest";
import { buildBoardTree } from "./boardTree";
import { applyCommand, bootState } from "./mock";
import { sandboxBoard } from "../sandbox/board";
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

  it("flow-грид — один живой контейнер: жители в одном слоте, грид растёт с их числом", () => {
    const flowSpec = spec({ zones: [
      { id: "g", title: "грид", layout: { kind: "flow", cols: { min: 2, max: 3 }, grow: "down" }, policy: { onOccupied: "merge" },
        cell: { w: 60, h: 84 }, setup: { 0: ["c1", "c2"] } },
    ], hand: undefined });
    const small = buildBoardTree(flowSpec, bootState(flowSpec, 2), "p1");
    expect(small.slotOf("c1")).toBe("g:0");
    expect(small.slotOf("c2")).toBe("g:0");
    const sixSpec = spec({ zones: [
      { id: "g", title: "грид", layout: { kind: "flow", cols: { min: 2, max: 3 }, grow: "down" }, policy: { onOccupied: "merge" },
        cell: { w: 60, h: 84 }, setup: { 0: ["c1", "c2", "c3", "c4", "c5", "x1"] } },
    ], hand: undefined, elements: [
      { kind: "card", id: "c1", face: "6♠" }, { kind: "card", id: "c2", face: "7♠" },
      { kind: "card", id: "c3", face: "8♠" }, { kind: "card", id: "c4", face: "9♠" },
      { kind: "card", id: "c5", face: "10♠" }, { kind: "card", id: "x1", face: "J♠" },
    ] });
    const six = buildBoardTree(sixSpec, bootState(sixSpec, 2), "p1");
    const h1 = small.homeOf("c1")!;
    const h6 = six.homeOf("x1")!;
    expect(h6.y).toBeGreaterThan(h1.y); // при grow:down шесть жителей легли в новые строки
  });

  it("seats: слот на каждое место вокруг центра, свой — снизу, напротив — сверху (относительно selfSeat)", () => {
    const roundSpec = spec({
      zones: [{ id: "table", title: "", layout: { kind: "seats" }, policy: { onOccupied: "reject" } }],
      seats: { count: { fixed: 4 }, show: "backs", swap: true },
    });
    const s = bootState(roundSpec, 4);
    const tree = buildBoardTree(roundSpec, s, "p1");
    // Экземпляр-слот на каждое место.
    for (const p of ["p1", "p2", "p3", "p4"]) expect(tree.origins[`table@${p}:0`]).toBeDefined();
    const self = tree.cellRects["table@p1:0"]!;
    const across = tree.cellRects["table@p3:0"]!; // через одного = напротив
    const left = tree.cellRects["table@p2:0"]!;
    const right = tree.cellRects["table@p4:0"]!;
    const cyMid = (self.y + across.y) / 2;
    expect(self.y).toBeGreaterThan(cyMid); // свой слот НИЖЕ центра (перед зрителем)
    expect(across.y).toBeLessThan(cyMid); // напротив — ВЫШЕ центра
    expect(left.x).toBeLessThan(right.x); // сосед слева левее соседа справа

    // Взгляд другого места: его слот тоже уезжает вниз (стол относителен зрителя).
    const asP2 = buildBoardTree(roundSpec, s, "p2");
    const self2 = asP2.cellRects["table@p2:0"]!;
    const cy2 = (self2.y + asP2.cellRects["table@p4:0"]!.y) / 2;
    expect(self2.y).toBeGreaterThan(cy2);
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

  it("free — одна зона-бокс (cellRect по cell), колода-стопка сидит по ЦЕНТРУ бокса", () => {
    const freeSpec = spec({ zones: [
      { id: "deck", title: "", layout: { kind: "free" }, policy: { onOccupied: "merge" }, cell: { w: 480, h: 360 }, setup: { 0: ["c1", "c2"] } },
    ], hand: undefined, seats: { count: { fixed: 1 }, show: "none", swap: false } });
    const tree = buildBoardTree(freeSpec, bootState(freeSpec, 1), "p1");
    // Один слот, рамка-бокс по cell.
    const box = tree.cellRects["deck:0"]!;
    expect(box.w).toBe(480);
    expect(box.h).toBe(360);
    expect(tree.origins["deck:1"]).toBeUndefined();
    // Обе карты в одном слоте (стопка); стопка НЕ в углу бокса — сдвинута к центру.
    expect(tree.slotOf("c1")).toBe("deck:0");
    expect(tree.slotOf("c2")).toBe("deck:0");
    const home = tree.homeOf("c1")!;
    expect(home.x).toBeGreaterThan(box.x + 100);
    expect(home.y).toBeGreaterThan(box.y + 80);
  });

  it("песочница: круглый стол по дефолту — бокс-борда в центре посадок, стол-круг внутри, колода в боксе", () => {
    const spec = sandboxBoard();
    const s = bootState(spec, 4);
    const tree = buildBoardTree(spec, s, "p1");
    const box = tree.cellRects["board:0"]!;
    const grid = tree.cellRects["table:0"]!;
    // Стол-круг целиком внутри бокса, центры совпадают.
    expect(grid.x + grid.w / 2).toBeCloseTo(box.x + box.w / 2, 3);
    expect(grid.y + grid.h / 2).toBeCloseTo(box.y + box.h / 2, 3);
    expect(grid.w).toBeLessThanOrEqual(box.w);
    // Посадочные слоты есть у каждого места, колода лежит в боксе.
    for (const seat of s.seats) expect(tree.cellRects[`place@${seat.id}:0`]).toBeDefined();
    expect(tree.slotOf("6♠")).toBe("board:0");
  });

  it("radial: один живой контейнер, рамка КВАДРАТНАЯ (круг ровный), жители по кругу внутри", () => {
    const rSpec = spec({ zones: [
      { id: "deck", title: "к", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
      { id: "round", title: "круг", layout: { kind: "radial" }, policy: { onOccupied: "merge" }, setup: { 0: ["c1", "c2"] } },
    ] });
    const tree = buildBoardTree(rSpec, bootState(rSpec, 2), "p1");
    const frame = tree.cellRects["round:0"]!;
    expect(frame.w).toBeCloseTo(frame.h, 6); // квадрат-габарит — круг не овалится
    expect(tree.slotOf("c1")).toBe("round:0");
    expect(tree.origins["round:1"]).toBeUndefined();
    for (const id of ["c1", "c2"]) {
      const h = tree.homeOf(id)!;
      expect(h.x).toBeGreaterThanOrEqual(frame.x);
      expect(h.y).toBeGreaterThanOrEqual(frame.y);
    }
  });

  it("круглый стол с бордой-боксом: бокс в ЦЕНТРЕ посадок, слоты мест не наезжают на бокс", () => {
    const box = { w: 480, h: 480 };
    const rt = spec({
      zones: [
        { id: "board", title: "", layout: { kind: "free" }, cell: box, shape: "circle", policy: { onOccupied: "merge" }, setup: { 0: ["c1", "c2"] } },
        { id: "table", title: "", layout: { kind: "seats" }, policy: { onOccupied: "reject" } },
      ],
      seats: { count: { fixed: 4 }, show: "backs", swap: true },
    });
    const s = bootState(rt, 4);
    const tree = buildBoardTree(rt, s, "p1");
    const frame = tree.cellRects["board:0"]!;
    const seatRects = s.seats.map((st) => tree.cellRects[`table@${st.id}:0`]!);
    // Бокс равноудалён от слотов всех мест (он в центре круга посадок).
    const c = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
    const dists = seatRects.map((r) => Math.hypot(r.x + r.w / 2 - c.x, r.y + r.h / 2 - c.y));
    for (const d of dists) {
      expect(d).toBeCloseTo(dists[0]!, 3);
      expect(d).toBeGreaterThan(box.w / 2); // слот места ВНЕ круга борды
    }
  });
});
