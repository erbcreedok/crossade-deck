import { describe, it, expect } from "vitest";
import { dockSlotKey, zoneDockConfig } from "./presentation";
import { dockIndexAt, dockPoses, type DockFrame } from "./dock";
import type { ZoneSpec } from "../core/spec";

// Сторож дока любой зоны: strip — ряд со вставкой (как был), pile — СТОПКА (без реордера и
// гэпов, дроп сверху, ключ «zone:0»), прочие виды честно не докуются (null, не тихий баг).

const zone = (layout: ZoneSpec["layout"], over: Partial<ZoneSpec> = {}): ZoneSpec =>
  ({ id: "z", title: "", layout, policy: { onOccupied: "merge" }, ...over });

describe("zoneDockConfig — какой вид у зоны в доке", () => {
  it("strip → ряд со вставкой; pile → стопка без реордера/превью; grid/free/seats — пока нет", () => {
    expect(zoneDockConfig(zone({ kind: "strip" }))).toMatchObject({ stack: false, reorder: "insert", preview: true });
    expect(zoneDockConfig(zone({ kind: "pile" }))).toMatchObject({ stack: true, reorder: null, preview: false });
    expect(zoneDockConfig(zone({ kind: "grid", cols: 3, rows: 3 }))).toBeNull();
    expect(zoneDockConfig(zone({ kind: "free" }))).toBeNull();
    expect(zoneDockConfig(zone({ kind: "seats" }))).toBeNull();
  });

  it("ключ контейнера: лента — экземпляр зрителя, pile — слот 0 (та же дверь move, что на борде)", () => {
    expect(dockSlotKey(zone({ kind: "strip" }), "p1")).toBe("z:p1");
    expect(dockSlotKey(zone({ kind: "pile" }), "p1")).toBe("z:0");
  });
});

describe("dock stack — стопка в доке", () => {
  const f: DockFrame = { w: 300, h: 600, insetTop: 0, insetBottom: 0, side: "bottom", flow: null, size: { fit: 5 }, card: { w: 100, h: 143 }, stack: true };

  it("все жители у центра отрезка (микрокаскад ≤ 12px), один ряд — глубина не растёт", () => {
    const poses = dockPoses(f, 8, null);
    const xs = poses.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(12);
    expect(new Set(poses.map((p) => p.y)).size).toBe(1);
  });

  it("дроп всегда СВЕРХУ: dockIndexAt = count в любой точке полосы", () => {
    expect(dockIndexAt(f, 5, { x: 20, y: 550 })).toBe(5);
    expect(dockIndexAt(f, 5, { x: 280, y: 550 })).toBe(5);
  });
});
