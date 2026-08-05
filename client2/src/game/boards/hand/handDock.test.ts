import { describe, it, expect } from "vitest";
import { dockBand, dockCell, dockDragPose, dockIndexAt, dockPoses, dockReserved, type DockFrame } from "./handDock";

// Сторож геометрии дока руки: край (side) и ось (flow) — данные; вертикальный док — та же
// математика со свёрнутыми осями; резерв отдаёт ровно свой край.

const CARD = { w: 100, h: 143 };
const frame = (side: DockFrame["side"], flow: DockFrame["flow"]): DockFrame => ({ w: 800, h: 600, insetTop: 40, insetBottom: 40, side, flow, card: CARD });

describe("handDock — док руки у края экрана", () => {
  it("bottom+horizontal: ряд по X у низа, все Y одинаковы и ниже середины экрана", () => {
    const poses = dockPoses(frame("bottom", "horizontal"), 3, null);
    expect(new Set(poses.map((p) => p.y)).size).toBe(1);
    expect(poses[0]!.y).toBeGreaterThan(300);
    expect(poses[0]!.x).toBeLessThan(poses[2]!.x);
  });

  it("top+horizontal: та же полоса у верха (Y выше середины)", () => {
    expect(dockPoses(frame("top", "horizontal"), 3, null)[0]!.y).toBeLessThan(300);
  });

  it("right+vertical: колонка по Y у правого края, все X одинаковы и правее середины", () => {
    const poses = dockPoses(frame("right", "vertical"), 3, null);
    expect(new Set(poses.map((p) => p.x)).size).toBe(1);
    expect(poses[0]!.x).toBeGreaterThan(400);
    expect(poses[0]!.y).toBeLessThan(poses[2]!.y);
  });

  it("вертикальная карта сохраняет аспект (не повёрнута): cell.h/cell.w == card", () => {
    const cell = dockCell(frame("left", "vertical"));
    expect(cell.h / cell.w).toBeCloseTo(CARD.h / CARD.w, 5);
  });

  it("индекс вставки по main-оси: вертикальный док считает по Y", () => {
    const f = frame("right", "vertical");
    const poses = dockPoses(f, 3, null);
    expect(dockIndexAt(f, 3, { x: poses[0]!.x, y: poses[0]!.y - 1 })).toBe(0);
    expect(dockIndexAt(f, 3, { x: poses[0]!.x, y: (poses[1]!.y + poses[2]!.y) / 2 })).toBe(2);
  });

  it("гэп-превью раздвигает ряд, но dockIndexAt по той же точке НЕ меняется (цель стоит)", () => {
    const f = frame("bottom", "horizontal");
    const base = dockPoses(f, 3, null);
    const mid = (base[1]!.x + base[2]!.x) / 2;
    const idx = dockIndexAt(f, 3, { x: mid, y: base[0]!.y });
    const spread = dockPoses(f, 3, idx);
    expect(spread.map((p) => p.x)).not.toEqual(base.map((p) => p.x));
    expect(dockIndexAt(f, 3, { x: mid, y: base[0]!.y })).toBe(idx);
  });

  it("dragPose зажат в ряд по main-оси, поперёк — в ряду", () => {
    const f = frame("right", "vertical");
    const p = dockDragPose(f, { x: 10, y: -500 });
    const poses = dockPoses(f, 1, null);
    expect(p.x).toBeCloseTo(poses[0]!.x, 5); // cross прижат к краю, палец по X игнорируется
    expect(p.y).toBeGreaterThan(0); // main зажат в диапазон ряда
  });

  it("band лежит вдоль своего края и покрывает позы карт", () => {
    const f = frame("left", "vertical");
    const b = dockBand(f);
    const poses = dockPoses(f, 4, null);
    expect(b.w).toBeLessThan(b.h); // вертикальная полоса
    for (const p of poses) {
      expect(p.x).toBeGreaterThan(b.x);
      expect(p.y).toBeLessThan(b.y + b.h);
    }
  });

  it("резерв отдаёт РОВНО свой край: bottom — низ (с хромом низа), left — лево, остальное нули", () => {
    const rb = dockReserved(frame("bottom", "horizontal"));
    expect(rb.bottom).toBeGreaterThan(0);
    expect(rb.top + rb.left + rb.right).toBe(0);
    const rl = dockReserved(frame("left", "vertical"));
    expect(rl.left).toBeGreaterThan(0);
    expect(rl.top + rl.bottom + rl.right).toBe(0);
  });
});
