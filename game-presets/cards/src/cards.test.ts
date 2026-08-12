import { describe, expect, it } from "vitest";
import { caps, fieldsOf, surfaceRecord, type FlippableFields, type SurfacedFields, type ValuedFields } from "game-kit";
import { crossade } from "./crossade.js";
import { BACK_SURFACE } from "./skin.classic.js";
import { cards } from "./cards.js";

describe("cards — the set expanded into nodes", () => {
  it("cards.builds-fifty-five-nodes — one node per physical card", () => {
    expect(cards()).toHaveLength(55);
  });

  it("cards.each-turns-over — every card is Flippable, turning over to the shared back", () => {
    for (const card of cards()) {
      const flip = fieldsOf<FlippableFields>(card, "Flippable");
      expect(flip, `${card.id}: not flippable`).toBeTruthy();
      expect(flip!.flip).toBe("turnOver");
      expect(flip!.back).toBe(BACK_SURFACE);
    }
  });

  it("cards.values-are-typed — each node carries its set's typed fields, in order", () => {
    const nodes = cards();
    const specs = crossade();
    expect(nodes).toHaveLength(specs.length);
    nodes.forEach((card, i) => {
      const valued = fieldsOf<ValuedFields>(card, "Valued");
      expect(valued, `${card.id}: no Valued`).toBeTruthy();
      expect(valued!.values).toEqual(specs[i]!.values);
    });
  });

  it("cards.ids-are-unique — the tree accepts every copy", () => {
    const ids = cards().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cards.faces-resolve — every card's face is a registered surface after the default install", () => {
    for (const card of cards()) {
      const surfaced = fieldsOf<SurfacedFields>(card, "Surfaced");
      expect(surfaced, `${card.id}: no Surfaced`).toBeTruthy();
      expect(surfaceRecord(surfaced!.surface), `${card.id}: dangling face ${surfaced!.surface}`).toBeTruthy();
      expect(caps(card).has("Bounded"), `${card.id}: no Bounded`).toBe(true);
    }
  });
});
