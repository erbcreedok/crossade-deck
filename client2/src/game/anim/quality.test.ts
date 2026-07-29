import { describe, expect, it } from "vitest";
import { FPS_DOWN, FPS_UP, nextTier, resolveProfile } from "./quality";

describe("resolveProfile", () => {
  it("авто отдаёт замеренный тир", () => {
    expect(resolveProfile("auto", "full")).toBe("full");
    expect(resolveProfile("auto", "reduced")).toBe("reduced");
  });

  it("форс перебивает авто", () => {
    expect(resolveProfile("full", "reduced")).toBe("full");
    expect(resolveProfile("reduced", "full")).toBe("reduced");
  });
});

describe("nextTier (гистерезис)", () => {
  it("мало данных (null) — тир не меняется", () => {
    expect(nextTier(null, "full")).toBe("full");
    expect(nextTier(null, "reduced")).toBe("reduced");
  });

  it("full → reduced только ниже DOWN", () => {
    expect(nextTier(FPS_DOWN - 1, "full")).toBe("reduced");
    expect(nextTier(FPS_DOWN + 1, "full")).toBe("full");
  });

  it("reduced → full только выше UP", () => {
    expect(nextTier(FPS_UP + 1, "reduced")).toBe("full");
    expect(nextTier(FPS_UP - 1, "reduced")).toBe("reduced");
  });

  it("в зазоре DOWN..UP тир держится (без дребезга)", () => {
    const mid = (FPS_DOWN + FPS_UP) / 2;
    expect(nextTier(mid, "full")).toBe("full");
    expect(nextTier(mid, "reduced")).toBe("reduced");
  });
});
