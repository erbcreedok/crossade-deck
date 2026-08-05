import { describe, it, expect } from "vitest";
import { flowAlong, handConfig } from "./handConfig";
import type { HandSpec } from "../core/spec";

// Сторож: дефолты руки живут в ОДНОМ месте — иначе потребители разъедутся. Дефолты — владельческие:
// bottom (прайм-зона большого пальца), ось вдоль края, hidden=false, locked=true (приватность).

describe("handConfig — нормализатор руки-данных", () => {
  it("нет руки — null (у стола рук нет, как у шахмат)", () => {
    expect(handConfig(undefined)).toBeNull();
  });

  it("дефолты: board + bottom + вдоль края (horizontal) + открытая + запертая", () => {
    expect(handConfig({ reorder: true })).toEqual({
      reorder: true,
      placement: "board",
      side: "bottom",
      flow: "horizontal",
      hidden: false,
      locked: true,
    });
  });

  it("ось по умолчанию следует КРАЮ: left/right → vertical, top/bottom → horizontal", () => {
    expect(handConfig({ reorder: true, side: "left" })!.flow).toBe("vertical");
    expect(handConfig({ reorder: true, side: "right" })!.flow).toBe("vertical");
    expect(handConfig({ reorder: true, side: "top" })!.flow).toBe("horizontal");
    expect(flowAlong("bottom")).toBe("horizontal");
  });

  it("явные значения пробрасываются как есть (включая ось поперёк края)", () => {
    const spec: HandSpec = { reorder: false, placement: "screen", side: "right", flow: "grid", hidden: true, locked: false };
    expect(handConfig(spec)).toEqual({ reorder: false, placement: "screen", side: "right", flow: "grid", hidden: true, locked: false });
  });
});
