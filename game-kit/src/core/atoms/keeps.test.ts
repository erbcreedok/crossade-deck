import { describe, expect, it } from "vitest";
import { node } from "../node.js";
import { Container } from "./container.js";
import { keepsAllows, Keeper } from "./keeps.js";

describe("keeps", () => {
  it("keeps.no-keeper-allows-all — absence of the atom is the open door", () => {
    // No narrowing declared: everything a child can do, it may do inside. Restriction is by absence
    // from an allow-list, never by a negation flag.
    const open = node("k1", Container({ layout: "free" }));
    expect(keepsAllows(open, "flip")).toBe(true);
    expect(keepsAllows(open, "drag")).toBe(true);
  });

  it("keeps.list-narrows — only the listed capabilities act inside", () => {
    // A discard that keeps drag: a card can be carried OUT but not flipped in place.
    const discard = node("k2", Container({ layout: "free" }), Keeper({ keeps: ["drag"] }));
    expect(keepsAllows(discard, "drag")).toBe(true);
    expect(keepsAllows(discard, "flip")).toBe(false);
  });

  it("keeps.empty-list-allows-nothing — a present-but-empty Keeper is the closed case", () => {
    // The OPEN case is having no Keeper at all; a Keeper with an empty list is the opposite extreme,
    // and it is a real state, not the same as absence.
    const frozen = node("k3", Container({ layout: "free" }), Keeper({ keeps: [] }));
    expect(keepsAllows(frozen, "drag")).toBe(false);
  });
});
