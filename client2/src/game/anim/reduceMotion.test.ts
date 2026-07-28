import { describe, expect, it } from "vitest";
import { resolveReduceMotion } from "./reduceMotion";

describe("resolveReduceMotion", () => {
  it("auto следует за ОС", () => {
    expect(resolveReduceMotion(true, "auto")).toBe(true);
    expect(resolveReduceMotion(false, "auto")).toBe(false);
  });

  it("on форсирует reduce-motion независимо от ОС", () => {
    expect(resolveReduceMotion(false, "on")).toBe(true);
    expect(resolveReduceMotion(true, "on")).toBe(true);
  });

  it("off форсирует полное движение независимо от ОС", () => {
    expect(resolveReduceMotion(true, "off")).toBe(false);
    expect(resolveReduceMotion(false, "off")).toBe(false);
  });
});
