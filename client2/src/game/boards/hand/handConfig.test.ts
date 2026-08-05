import { describe, it, expect } from "vitest";
import { flowAlong, handConfig, handLocks } from "./handConfig";
import type { HandSpec } from "../core/spec";

// Сторож: дефолты руки живут в ОДНОМ месте — иначе потребители разъедутся. Дефолты — владельческие:
// bottom (прайм-зона большого пальца), ось вдоль края, hidden=false, locked=true (приватность).

describe("handConfig — нормализатор руки-данных", () => {
  it("нет руки — null (у стола рук нет, как у шахмат)", () => {
    expect(handConfig(undefined)).toBeNull();
  });

  it("дефолты: вдоль края (flow null — решает док), скрытая и запертая (приватность)", () => {
    expect(handConfig({ reorder: true })).toEqual({
      reorder: true,
      flow: null,
      size: { fit: 5 },
      hidden: true,
      locked: true,
      preview: true,
    });
  });

  it("ось вдоль края (для дока): left/right → vertical, top/bottom → horizontal", () => {
    expect(flowAlong("left")).toBe("vertical");
    expect(flowAlong("right")).toBe("vertical");
    expect(flowAlong("top")).toBe("horizontal");
    expect(flowAlong("bottom")).toBe("horizontal");
  });

  it("явные значения пробрасываются как есть", () => {
    const spec: HandSpec = { reorder: false, flow: "grid", size: 7, hidden: true, locked: false };
    expect(handConfig(spec)).toEqual({ reorder: false, flow: "grid", size: { fit: 7 }, hidden: true, locked: false, preview: true });
    expect(handConfig({ reorder: true, size: { w: 60, h: 86 } })!.size).toEqual({ cell: { w: 60, h: 86 } });
  });
});

describe("handLocks — чужая рука заперта по умолчанию", () => {
  const cfg = (locked: boolean) => handConfig({ reorder: true, locked });

  it("чужой hand-слот при locked — заперт; свой — никогда", () => {
    expect(handLocks(cfg(true), "hand:p2", "p1")).toBe(true);
    expect(handLocks(cfg(true), "hand:p1", "p1")).toBe(false);
  });

  it("отпертая рука (locked:false) — общая: чужой слот не заперт", () => {
    expect(handLocks(cfg(false), "hand:p2", "p1")).toBe(false);
  });

  it("не-руки не запираются, а без конфига действует приватность (locked по умолчанию)", () => {
    expect(handLocks(cfg(true), "board:0", "p1")).toBe(false);
    expect(handLocks(null, "hand:p2", "p1")).toBe(true);
  });
});
