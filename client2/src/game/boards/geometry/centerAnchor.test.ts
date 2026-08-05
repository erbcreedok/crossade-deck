import { describe, it, expect } from "vitest";
import { roundTableBoard } from "../library/roundTable";
import { initialState } from "../core/state";
import { buildBoardTree } from "./boardTree";
import type { RingPresetName } from "../library/ringPresets";

// Сторож правила владельца: круглый стол «растёт от центра». Центр круга — ЯКОРЬ: когда карт в
// центре прибавляется (5→7), кольцо растёт СИММЕТРИЧНО внутрь, а центр стола/бокса и общий габарит
// доски стоят на месте — иначе под зумленной (неподвижной) камерой круг дрейфует вправо.
// Разгадка дрейфа — envelope: при потолке (capped) бокс/посадки считаются по кругу-максимуму.

function metrics(dealt: number, ring: RingPresetName): { table: number; box: number; boardW: number } {
  const spec = roundTableBoard({ seats: 4, dealt, ring });
  const state = initialState(spec, 4);
  const tree = buildBoardTree(spec, state, "p1", state.free);
  const t = tree.cellRects["table:0"]!; // рамка центра стола (радиальный круг)
  const b = tree.cellRects["board:0"]!; // рамка бокса-борды (внешний круг)
  return { table: t.x + t.w / 2, box: b.x + b.w / 2, boardW: tree.size.w };
}

describe("круглый стол: центр — якорь, рост симметричен (владелец)", () => {
  it("capped: центр стола, центр бокса и габарит доски стоят при 4→7 картах (нет дрейфа вправо)", () => {
    const base = metrics(4, "capped");
    for (const n of [5, 6, 7]) {
      const m = metrics(n, "capped");
      expect(m.table).toBeCloseTo(base.table, 3);
      expect(m.box).toBeCloseTo(base.box, 3);
      expect(m.boardW).toBeCloseTo(base.boardW, 3);
    }
  });

  it("centerX стола совпадает с centerX бокса — круги соосны (капед)", () => {
    for (const n of [4, 5, 6, 7]) {
      const m = metrics(n, "capped");
      expect(m.table).toBeCloseTo(m.box, 3);
    }
  });

  it("grow (без потолка): стол растёт вниз-вправо — центр смещается, это конфиг другой игры", () => {
    expect(metrics(7, "grow").table).toBeGreaterThan(metrics(4, "grow").table);
  });
});
