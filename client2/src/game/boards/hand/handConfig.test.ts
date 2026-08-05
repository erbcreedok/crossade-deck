import { describe, it, expect } from "vitest";
import { handConfig } from "./handConfig";
import type { HandSpec } from "../core/spec";

// Сторож: дефолты руки живут в ОДНОМ месте (row + board) — иначе потребители разъедутся.

describe("handConfig — нормализатор руки-данных", () => {
  it("нет руки — null (у стола рук нет, как у шахмат)", () => {
    expect(handConfig(undefined)).toBeNull();
  });

  it("дефолты: layout=row, placement=board (прежнее поведение)", () => {
    expect(handConfig({ reorder: true })).toEqual({ reorder: true, layout: "row", placement: "board" });
  });

  it("явные значения пробрасываются как есть", () => {
    const spec: HandSpec = { reorder: false, layout: "fan", placement: "screen" };
    expect(handConfig(spec)).toEqual({ reorder: false, layout: "fan", placement: "screen" });
  });
});
