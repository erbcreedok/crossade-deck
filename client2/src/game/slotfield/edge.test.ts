import { describe, it, expect } from "vitest";
import { canAccept, add, insert, remove } from "./container";
import { at, move, reorder, removeFrom, type Board } from "./slotField";
import { foldAction } from "./actionFold";
import { resolveDrop, type DropCandidate } from "./dropResolve";
import { FieldZone } from "./fieldZone";
import { gridSlots } from "./layout/slots";

// Adversarial edge-кейсы логического слоя (self-review): границы, пустые входы, отсутствующие ключи.
describe("container edge", () => {
  it("insert за длину — аппендит; add([]) не меняет; maxSize ровно на пределе — отказ", () => {
    expect(insert({ members: ["a"] }, ["x"], 9).members).toEqual(["a", "x"]);
    expect(add({ members: ["a"] }, []).members).toEqual(["a"]);
    expect(canAccept({ members: ["a", "b"], maxSize: 2 }, "x")).toBe(false);
    expect(remove({ members: ["a", "b"] }, ["a", "b"]).members).toEqual([]);
  });
});

describe("board edge", () => {
  const b = (): Board => ({ slots: { "0,0": { members: ["a"] } }, onEmpty: "keep" });
  it("reorder/removeFrom по несуществующему слоту — no-op", () => {
    expect(reorder(b(), "9,9", ["a"], 0)).toEqual(b());
    expect(removeFrom(b(), "9,9", ["a"])).toEqual(b());
  });
  it("move from===to — фигура остаётся в слоте (наверх)", () => {
    const nb = move(b(), "0,0", "0,0", ["a"]);
    expect(at(nb, "0,0")?.members).toEqual(["a"]);
  });
});

describe("actionFold edge", () => {
  it("пустая группа: all → не блок, each → пусто", () => {
    expect(foldAction([], () => true, "all")).toEqual({ apply: [], container: false, blocked: false });
    expect(foldAction([], () => true, "each")).toEqual({ apply: [], container: false, blocked: false });
  });
});

describe("dropResolve edge", () => {
  it("два одинаковых кандидата — детерминированно берёт одного", () => {
    const mk = (id: string): DropCandidate<null> => ({ id, contains: () => true, accepts: () => true, depth: 1 });
    const r = resolveDrop([mk("a"), mk("b")], 0, 0, null);
    expect(["a", "b"]).toContain(r!.id);
  });
});

describe("boardZone edge", () => {
  const layout = gridSlots({ cols: 2, cell: { w: 100, h: 100 }, gap: 0, origin: { x: 0, y: 0 } }, 1);
  const bounds = { x: 0, y: 0, w: 200, h: 100 };
  it("dropAt неизвестной фигуры / dropSetAt пустого набора — moved false", () => {
    const z = new FieldZone({ slots: layout, board: { slots: { "0,0": { members: ["a"] } }, onEmpty: "keep" }, bounds });
    expect(z.dropAt("zzz", 50, 50).moved).toBe(false);
    expect(z.dropSetAt([], 150, 50).moved).toBe(false);
  });
  it("figureHome неизвестной — центр рамки", () => {
    const z = new FieldZone({ slots: layout, board: { slots: {} }, bounds });
    expect(z.figureHome("nope")).toEqual({ x: 100, y: 50 });
  });
});
