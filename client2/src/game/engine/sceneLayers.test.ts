import { describe, it, expect } from "vitest";
import { levelOf, bucketByLevel, type Level } from "./sceneLayers";
import type { ShadowShape } from "../ui/Card";

describe("sceneLayers.levelOf", () => {
  it("план → уровень (удержание и драг — в слой драга)", () => {
    expect(levelOf("idle")).toBe("idle");
    expect(levelOf("floating")).toBe("floating");
    expect(levelOf("fan")).toBe("fan");
    expect(levelOf("drag")).toBe("drag");
    expect(levelOf("held")).toBe("drag");
  });
});

describe("sceneLayers.bucketByLevel", () => {
  const rect = (x: number): ShadowShape => ({ x, y: 0, hw: 1, hh: 1, rot: 0 });

  it("группирует силуэты по уровню", () => {
    const items: { level: Level; rect: ShadowShape }[] = [
      { level: "idle", rect: rect(1) },
      { level: "drag", rect: rect(2) },
      { level: "idle", rect: rect(3) },
    ];
    const b = bucketByLevel(items);
    expect(b.idle.map((r) => r.x)).toEqual([1, 3]);
    expect(b.drag.map((r) => r.x)).toEqual([2]);
    expect(b.floating).toEqual([]);
    expect(b.fan).toEqual([]);
  });

  it("пустой вход → все уровни пусты", () => {
    const b = bucketByLevel([]);
    expect(b.idle).toEqual([]);
    expect(b.drag).toEqual([]);
  });
});
