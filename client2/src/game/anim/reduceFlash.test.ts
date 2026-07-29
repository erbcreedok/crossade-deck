import { describe, expect, it } from "vitest";
import { resolveReduceFlash } from "./reduceFlash";

describe("resolveReduceFlash", () => {
  it("auto следует за ОС (prefers-reduced-motion)", () => {
    expect(resolveReduceFlash(true, "auto")).toBe(true);
    expect(resolveReduceFlash(false, "auto")).toBe(false);
  });

  it("on форсирует «без вспышек» независимо от ОС", () => {
    expect(resolveReduceFlash(false, "on")).toBe(true);
    expect(resolveReduceFlash(true, "on")).toBe(true);
  });

  it("off форсирует вспышки независимо от ОС", () => {
    expect(resolveReduceFlash(true, "off")).toBe(false);
    expect(resolveReduceFlash(false, "off")).toBe(false);
  });
});
