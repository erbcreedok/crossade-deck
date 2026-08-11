import { describe, expect, it } from "vitest";
import { caps, fieldsOf } from "../core/node.js";
import { type SurfacedFields } from "../core/atoms/surfaced.js";
import { type FlippableFields } from "../core/atoms/flippable.js";
import { type ValuedFields } from "../core/atoms/valued.js";
import { extentOf, type BoundedFields } from "../core/atoms/bounded.js";
import { deck } from "./deck.js";

describe("deck", () => {
  it("deck.expands-counts — a count of three yields three cards", () => {
    expect(deck([{ face: "ace", count: 3 }])).toHaveLength(3);
  });

  it("deck.default-count-one — no count is a single card", () => {
    expect(deck([{ face: "joker" }])).toHaveLength(1);
  });

  it("deck.multiple-specs-total — the deck is the sum of the specs", () => {
    expect(deck([{ face: "a", count: 2 }, { face: "b", count: 3 }])).toHaveLength(5);
  });

  it("deck.unique-ids — every physical copy is its own node", () => {
    const ids = deck([{ face: "ace", count: 3 }]).map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("deck.each-card-carries-its-face", () => {
    const [card] = deck([{ face: "queen" }]);
    expect(fieldsOf<SurfacedFields>(card!, "Surfaced")?.surface).toBe("queen");
  });

  it("deck.two-sided-card-is-flippable — a named back wires the turn", () => {
    const [card] = deck([{ face: "queen", back: "tartan" }]);
    expect(caps(card!).has("Flippable")).toBe(true);
    expect(fieldsOf<FlippableFields>(card!, "Flippable")?.back).toBe("tartan");
  });

  it("deck.faceless-card-has-no-flippable — one-sided card cannot be turned", () => {
    const [card] = deck([{ face: "token" }]);
    expect(caps(card!).has("Flippable")).toBe(false);
  });

  it("deck.values-ride-along — declared data becomes Valued", () => {
    const [card] = deck([{ face: "7h", values: { rank: 7, suit: "hearts" } }]);
    expect(fieldsOf<ValuedFields>(card!, "Valued")?.values).toEqual({ rank: 7, suit: "hearts" });
  });

  it("deck.no-values-no-valued — a card with no data carries no Valued", () => {
    const [card] = deck([{ face: "plain" }]);
    expect(caps(card!).has("Valued")).toBe(false);
  });

  it("deck.size-option-cuts-cards — every card is cut to the given size", () => {
    const [card] = deck([{ face: "big" }], { size: { w: 2, h: 3 } });
    expect(extentOf(fieldsOf<BoundedFields>(card!, "Bounded")!.bounds)).toMatchObject({ w: 2, h: 3 });
  });
});
