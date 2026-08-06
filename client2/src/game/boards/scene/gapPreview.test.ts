import { describe, it, expect } from "vitest";
import { SceneGapPreview } from "./gapPreview";
import { boardWorld } from "../geometry/dropPlan";
import { group, leaf } from "../../slot/types";
import { linear } from "../../slot/layouts";
import type { ZoneSpec } from "../core/spec";

// Сторож SMART REORDER борды: гэп ставится только превьюируемым контейнерам (лента — дефолт true,
// прочие зоны — opt-in preview:true), идемпотентно; кросс-дроп доотправляет reorder на индекс превью.

const CELL = { w: 100, h: 143 };
const zone = (over: Partial<ZoneSpec>): ZoneSpec =>
  ({ id: "row", title: "", layout: { kind: "flow" }, policy: { onOccupied: "merge" }, ...over }) as ZoneSpec;

const handZone: ZoneSpec = { id: "hand", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" } };

function harness(zones: ZoneSpec[], slots: Record<string, { members: string[] }>) {
  const calls = { retargets: [] as string[], cmds: [] as unknown[] };
  const p = new SceneGapPreview({
    world: () => boardWorld({ zones: [handZone, ...zones], cellRects: {}, slots, homeOf: () => null }),
    selfSeat: "p1",
    retargetSlot: (slot) => calls.retargets.push(slot),
    dispatch: (cmd) => calls.cmds.push(cmd),
    wake: () => {},
  });
  return { p, calls };
}

const grp = (id: string, ids: string[]) => group(id, linear({ axis: "x", gap: 8 }), ids.map((m) => leaf(m, m, CELL)));

describe("SceneGapPreview — гэп-превью контейнеров борды", () => {
  it("лента превьюится по дефолту: hover ставит gap и перецеливает слот", () => {
    const g = grp("hand:p1", ["a", "b"]);
    const { p, calls } = harness([], { "hand:p1": { members: ["a", "b"] } });
    p.hover("x", { group: g, index: 1 });
    expect(g.gap).toEqual({ index: 1, size: CELL, skip: "x" });
    expect(calls.retargets).toEqual(["hand:p1"]);
  });

  it("идемпотентно: тот же контейнер и индекс — без повторного перецела; смена индекса — перецел", () => {
    const g = grp("hand:p1", ["a", "b"]);
    const { p, calls } = harness([], { "hand:p1": { members: ["a", "b"] } });
    p.hover("x", { group: g, index: 1 });
    p.hover("x", { group: g, index: 1 });
    expect(calls.retargets.length).toBe(1);
    p.hover("x", { group: g, index: 2 });
    expect(g.gap?.index).toBe(2);
  });

  it("зона БЕЗ preview не превьюится (opt-in), с preview:true — превьюится; swap — никогда", () => {
    const plain = grp("row:0", ["a"]);
    const { p } = harness([zone({})], { "row:0": { members: ["a"] } });
    p.hover("x", { group: plain, index: 0 });
    expect(plain.gap).toBeUndefined();
    const { p: p2 } = harness([zone({ preview: true })], { "row:0": { members: ["a"] } });
    p2.hover("x", { group: plain, index: 0 });
    expect(plain.gap).toBeDefined();
    const swap = grp("row:0", ["a"]);
    const { p: p3 } = harness([zone({ preview: true, reorder: "swap" })], { "row:0": { members: ["a"] } });
    p3.hover("x", { group: swap, index: 0 });
    expect(swap.gap).toBeUndefined();
  });

  it("смена контейнера закрывает дыру у прежнего; clear — у текущего", () => {
    const a = grp("hand:p1", ["a"]);
    const b = grp("row:0", ["b"]);
    const { p } = harness([zone({ preview: true })], { "hand:p1": { members: ["a"] }, "row:0": { members: ["b"] } });
    p.hover("x", { group: a, index: 0 });
    p.hover("x", { group: b, index: 0 });
    expect(a.gap).toBeUndefined();
    expect(b.gap).toBeDefined();
    p.clear();
    expect(b.gap).toBeUndefined();
  });

  it("кросс-дроп: и в ленту, и в превью-зону — reorderSlot с грузом на индексе превью", () => {
    const { p, calls } = harness([zone({ preview: true })], { "hand:p1": { members: ["a", "b", "x"] }, "row:0": { members: ["c", "x"] } });
    p.afterCrossDrop("x", "hand:p1", 1); // move уже прошёл: состав содержит x в конце
    expect(calls.cmds[0]).toEqual({ t: "reorderSlot", key: "hand:p1", order: ["a", "x", "b"] });
    p.afterCrossDrop("x", "row:0", 0);
    expect(calls.cmds[1]).toEqual({ t: "reorderSlot", key: "row:0", order: ["x", "c"] });
  });

  it("кросс-дроп в НЕ-превьюируемую зону — тишина (старое поведение: аппенд)", () => {
    const { p, calls } = harness([zone({})], { "row:0": { members: ["c", "x"] } });
    p.afterCrossDrop("x", "row:0", 0);
    expect(calls.cmds.length).toBe(0);
  });
});
