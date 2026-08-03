import { describe, it, expect } from "vitest";
import { FieldZone } from "./fieldZone";
import type { Board } from "./slotField";
import { gridSlots } from "./layout/slots";
import type { PileIdentity } from "./pileIdentity";

// FieldZone — сердце визуального полигона, но БЕЗ Pixi: логический board + подключаемая раскладка +
// размещение фигур + резолв дропа между слотами + запертость. Визуал потом читает отсюда.
const layout = gridSlots({ cols: 3, cell: { w: 100, h: 100 }, gap: 0, origin: { x: 0, y: 0 } }, 2); // 3×2
const bounds = { x: 0, y: 0, w: 300, h: 200 };
const make = (slots: Board["slots"], onOccupied?: "merge" | "swap" | "capture" | "reject") =>
  new FieldZone({ slots: layout, board: { slots, onEmpty: "keep" }, bounds, onOccupied });

describe("FieldZone — размещение", () => {
  it("locate находит слот и индекс фигуры", () => {
    const z = make({ "0,0": { members: ["a"] }, "1,2": { members: ["p", "q"] } });
    expect(z.locate("a")).toEqual({ key: "0,0", index: 0 });
    expect(z.locate("q")).toEqual({ key: "1,2", index: 1 });
    expect(z.locate("zzz")).toBeNull();
  });
  it("figureHome — центр слота (одиночка без сдвига)", () => {
    const z = make({ "0,1": { members: ["a"] } });
    expect(z.figureHome("a")).toEqual({ x: 150, y: 50 }); // слот (0,1): центр 150,50
  });
});

describe("FieldZone — дроп между слотами", () => {
  it("дроп в ПУСТОЙ слот переносит фигуру (board обновляется)", () => {
    const z = make({ "0,0": { members: ["a"] } });
    expect(z.dropAt("a", 250, 50)).toEqual({ moved: true }); // точка в слоте (0,2)
    expect(z.locate("a")).toEqual({ key: "0,2", index: 0 });
    expect(z.locate("a")?.key).not.toBe("0,0");
  });
  it("дроп в ТОТ ЖЕ слот — не переезд", () => {
    const z = make({ "0,0": { members: ["a"] } });
    expect(z.dropAt("a", 50, 50).moved).toBe(false); // точка в (0,0)
  });
  it("дроп в занятый слот с maxSize=1 — отказ (canAccept)", () => {
    const z = make({ "0,0": { members: ["a"] }, "0,1": { members: ["b"], maxSize: 1 } });
    expect(z.dropAt("a", 150, 50).moved).toBe(false); // (0,1) полон
    expect(z.locate("a")?.key).toBe("0,0"); // остался
  });
  it("дроп вне всех слотов — не переезд", () => {
    const z = make({ "0,0": { members: ["a"] } });
    expect(z.dropAt("a", 9999, 9999).moved).toBe(false);
  });
});

describe("FieldZone — onOccupied (исход на занятый слот)", () => {
  const two = (oo?: "merge" | "swap" | "capture" | "reject") => make({ "0,0": { members: ["a"] }, "0,1": { members: ["b"] } }, oo);
  it("merge (дефолт): ложится поверх занятого", () => {
    const z = two();
    expect(z.dropAt("a", 150, 50).moved).toBe(true); // (0,1)
    expect(z.board.slots["0,1"]!.members).toEqual(["b", "a"]);
  });
  it("swap: меняются местами", () => {
    const z = two("swap");
    expect(z.dropAt("a", 150, 50).moved).toBe(true);
    expect(z.locate("a")?.key).toBe("0,1");
    expect(z.locate("b")?.key).toBe("0,0");
  });
  it("capture: цель вытеснена (captured), новичок занял слот", () => {
    const z = two("capture");
    const r = z.dropAt("a", 150, 50);
    expect(r).toEqual({ moved: true, captured: ["b"] });
    expect(z.locate("a")?.key).toBe("0,1");
    expect(z.locate("b")).toBeNull(); // ушла с борда
  });
  it("reject: занятый слот отказывает", () => {
    const z = two("reject");
    expect(z.dropAt("a", 150, 50).moved).toBe(false);
    expect(z.locate("a")?.key).toBe("0,0");
  });
});

describe("FieldZone — accept-правило (rules as data)", () => {
  it("правило гейтит приём даже в пустой слот", () => {
    const z = new FieldZone({
      slots: layout,
      board: { slots: { "0,0": { members: ["a"] } }, onEmpty: "keep" },
      bounds,
      rule: (ctx) => ctx.toKey === "0,1", // принимает только слот (0,1)
    });
    expect(z.dropAt("a", 150, 50).moved).toBe(true); // (0,1) — разрешён
    expect(z.locate("a")?.key).toBe("0,1");
    const z2 = new FieldZone({ slots: layout, board: { slots: { "0,0": { members: ["a"] } }, onEmpty: "keep" }, bounds, rule: () => false });
    expect(z2.dropAt("a", 250, 50).moved).toBe(false); // всё запрещено
  });
});

describe("FieldZone — dropSetAt (перенос НАБОРА)", () => {
  it("переносит все фигуры набора в целевой слот (в порядке набора)", () => {
    const z = make({ "0,0": { members: ["a"] }, "0,1": { members: ["b"] } });
    const r = z.dropSetAt(["a", "b"], 250, 50); // (0,2) пустой
    expect(r.moved).toBe(true);
    expect(z.locate("a")?.key).toBe("0,2");
    expect(z.locate("b")?.key).toBe("0,2");
    expect(z.board.slots["0,2"]!.members).toEqual(["a", "b"]); // порядок набора сохранён
  });
  it("вне слотов — не переносит", () => {
    const z = make({ "0,0": { members: ["a"] } });
    expect(z.dropSetAt(["a"], 9999, 9999).moved).toBe(false);
  });
});

describe("FieldZone — цепочка приёма элемент→зона→engine (issue #72)", () => {
  it("элемент-rule reject побеждает даже пустой слот (нельзя нарушить)", () => {
    const z = new FieldZone({ slots: layout, board: { slots: { "0,0": { members: ["a"] } }, onEmpty: "keep" }, bounds, rule: () => false });
    expect(z.dropSetAt(["a"], 150, 50).moved).toBe(false);
  });

  const pile = (peekable: boolean): PileIdentity => ({
    size: 1,
    tagsAll: new Set(["card"]),
    tagsAny: new Set(["card"]),
    facing: "down",
    capabilities: { draggable: true, flippable: true, burnable: true, peekable },
  });

  it("слепая зона (requiresCapability): набор без способности зона не принимает — pass, engine не трогается", () => {
    const z = new FieldZone({ slots: layout, board: { slots: { "0,0": { members: ["a"] } }, onEmpty: "keep" }, bounds, requiresCapability: "peekable" });
    expect(z.dropSetAt(["a"], 250, 50, pile(false)).moved).toBe(false); // (0,2) пустой, структурно принял бы — но зона слепа
    expect(z.locate("a")?.key).toBe("0,0"); // осталась на месте
  });

  it("слепая зона: набор С требуемой способностью проходит к engine как обычно", () => {
    const z = new FieldZone({ slots: layout, board: { slots: { "0,0": { members: ["a"] } }, onEmpty: "keep" }, bounds, requiresCapability: "peekable" });
    expect(z.dropSetAt(["a"], 250, 50, pile(true)).moved).toBe(true);
    expect(z.locate("a")?.key).toBe("0,2");
  });

  it("без requiresCapability зона прозрачна к pile-аргументу — ведёт себя как раньше (engine-слой)", () => {
    const z = new FieldZone({ slots: layout, board: { slots: { "0,0": { members: ["a"] } }, onEmpty: "keep" }, bounds });
    expect(z.dropSetAt(["a"], 250, 50, pile(false)).moved).toBe(true);
  });
});

describe("FieldZone — запертость", () => {
  it("clamp держит фигуру в рамке зоны", () => {
    const z = make({});
    expect(z.clamp({ x: -50, y: 999 }, { w: 10, h: 10 })).toEqual({ x: 10, y: 190 });
  });
});
