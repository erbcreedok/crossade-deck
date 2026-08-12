import { describe, expect, it } from "vitest";
import { node, Surfaced } from "game-kit";

describe("@game-presets/cards resolves the engine", () => {
  it("cards.resolves-the-engine — imports game-kit by name and builds a surfaced node", () => {
    const probe = node("probe", Surfaced({ surface: "probe" }));
    expect(probe.id).toBe("probe");
    expect(probe.atoms.has("Surfaced")).toBe(true);
  });
});
