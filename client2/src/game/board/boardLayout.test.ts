import { describe, it, expect } from "vitest";
import { layoutForPreset } from "./boardLayout";
import type { BoardPreset } from "./boardPresets";

// Чистая геометрия борда из пресета (стратегия grid/ring → позиционированные слоты + рамка). Вынос
// из движка — шаг к BoardFactory. Тестируется числами.
const opts = { left: 40, top: 100, cardW: 100, cardH: 140 };

describe("layoutForPreset", () => {
  it("grid: cols*rows слотов + рамка по сетке", () => {
    const preset = { title: "", cols: 3, rows: 2, onOccupied: "merge", slots: {} } as BoardPreset;
    const { positioned, bounds } = layoutForPreset(preset, opts);
    expect(positioned).toHaveLength(6);
    expect(positioned[0]!.key).toBe("0,0");
    expect(bounds.x).toBe(40);
    expect(bounds.w).toBeGreaterThan(0);
    expect(bounds.h).toBeGreaterThan(0);
  });
  it("ring: ringCount слотов, квадратная рамка", () => {
    const preset = { title: "", cols: 0, rows: 0, layout: "ring", ringCount: 8, onOccupied: "merge", slots: {} } as BoardPreset;
    const { positioned, bounds } = layoutForPreset(preset, opts);
    expect(positioned).toHaveLength(8);
    expect(positioned[0]!.key).toBe("ring0");
    expect(bounds.w).toBeCloseTo(bounds.h, 5); // кольцо — в квадрате
  });
});
