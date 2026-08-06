import { describe, expect, it } from "vitest";
import { freeZoneAt, isDeckSlot, nearestMemberIndex, planDrop, reorderModeOf, swappedOrder, type DropWorld } from "./dropPlan";
import type { ZoneSpec } from "../core/spec";

// План дропа — чистое ядро resolveDrop сцены: команды порта из точки отпускания.

const zones: ZoneSpec[] = [
  { id: "board", title: "", layout: { kind: "free" }, policy: { onOccupied: "merge" }, shape: "circle", cell: { w: 400, h: 400 } },
  { id: "table", title: "", layout: { kind: "flow" }, policy: { onOccupied: "merge" } },
  { id: "hand", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" } },
];

function world(slots: Record<string, string[]>, homes: Record<string, { x: number; y: number }> = {}): DropWorld {
  return {
    zones,
    cellRects: { "board:0": { x: 0, y: 0, w: 400, h: 400 } },
    members: (slot) => slots[slot] ?? [],
    homeOf: (id) => homes[id] ?? null,
    occupiedKeys: () => Object.keys(slots).filter((k) => slots[k]!.length > 0),
  };
}

describe("правила слотов", () => {
  it("isDeckSlot: только слот 0 free-зоны; reorderModeOf: flow — insert по умолчанию", () => {
    const w = world({});
    expect(isDeckSlot(w, "board:0")).toBe(true);
    expect(isDeckSlot(w, "board:2")).toBe(false);
    expect(isDeckSlot(w, "table:0")).toBe(false);
    expect(reorderModeOf(w, "table:0")).toBe("insert");
    expect(reorderModeOf(w, "board:0")).toBeNull();
  });

  it("freeZoneAt уважает круг: угол бокса — мимо", () => {
    const w = world({});
    expect(freeZoneAt(w, { x: 200, y: 200 })).toBe("board");
    expect(freeZoneAt(w, { x: 5, y: 5 })).toBeNull();
  });

  it("swappedOrder меняет двоих местами; чужой индекс — без изменений", () => {
    expect(swappedOrder(["a", "b", "c"], "a", 2)).toEqual(["c", "b", "a"]);
    expect(swappedOrder(["a", "b", "c"], "a", 9)).toEqual(["a", "b", "c"]);
  });

  it("nearestMemberIndex ищет ближайшего жителя, исключая сам груз", () => {
    const w = world({}, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c: { x: 100, y: 0 } });
    expect(nearestMemberIndex(w, ["a", "b", "c"], "a", { x: 2, y: 0 })).toBe(1);
  });
});

describe("planDrop", () => {
  it("лента → та же лента: reorderSlot с новым порядком (рука — обычный реордер-контейнер)", () => {
    const w = world({ "hand:p1": ["a", "b", "c"] });
    const plan = planDrop(w, { el: "c", from: "hand:p1", target: { slot: "hand:p1", index: 0 }, cp: { x: 0, y: 0 }, selfSeat: "p1", carriedFaceUp: true });
    expect(plan).toEqual({ kind: "command", cmd: { t: "reorderSlot", key: "hand:p1", order: ["c", "a", "b"] } });
  });

  it("переезд в другой слот: move; сторона undefined — зона решает сама", () => {
    const w = world({ "hand:p1": ["a"] });
    const plan = planDrop(w, { el: "a", from: "hand:p1", target: { slot: "table:0", index: 0 }, cp: { x: 0, y: 0 }, selfSeat: "p1", carriedFaceUp: true });
    expect(plan.kind).toBe("command");
    if (plan.kind === "command" && plan.cmd.t === "move") expect(plan.cmd.face).toBeUndefined();
  });

  it("мимо слотов, в круг: move в новый свободный слот с точкой и стороной как несли", () => {
    const w = world({ "board:0": ["x"], "hand:p1": ["a"] });
    const plan = planDrop(w, { el: "a", from: "hand:p1", target: null, cp: { x: 200, y: 300 }, selfSeat: "p1", carriedFaceUp: true });
    expect(plan).toEqual({ kind: "command", cmd: { t: "move", el: "a", from: "hand:p1", to: "board:1", at: { x: 200, y: 300 }, face: true } });
  });

  it("одинокая свободная стопка внутри круга просто переезжает (placeFree)", () => {
    const w = world({ "board:1": ["a"] });
    const plan = planDrop(w, { el: "a", from: "board:1", target: null, cp: { x: 100, y: 200 }, selfSeat: "p1", carriedFaceUp: false });
    expect(plan).toEqual({ kind: "command", cmd: { t: "placeFree", key: "board:1", at: { x: 100, y: 200 } } });
  });

  it("мимо всего (вне круга) — none; чужая ЗАПЕРТАЯ лента дроп не принимает, отпертая — принимает", () => {
    const w = world({ "hand:p1": ["a"] });
    expect(planDrop(w, { el: "a", from: "hand:p1", target: null, cp: { x: 990, y: 990 }, selfSeat: "p1", carriedFaceUp: true }).kind).toBe("none");
    expect(planDrop(w, { el: "a", from: "hand:p1", target: { slot: "hand:p2", index: 0 }, cp: { x: 0, y: 0 }, selfSeat: "p1", carriedFaceUp: true }).kind).toBe("none");
    const open: ZoneSpec[] = zones.map((z) => (z.id === "hand" ? { ...z, locked: false } : z));
    const wOpen: DropWorld = { ...w, zones: open };
    const plan = planDrop(wOpen, { el: "a", from: "hand:p1", target: { slot: "hand:p2", index: 0 }, cp: { x: 0, y: 0 }, selfSeat: "p1", carriedFaceUp: true });
    expect(plan.kind).toBe("command");
  });
});
