import { describe, expect, it } from "vitest";
import { add, node } from "../node.js";
import { Grippable, grippableBy } from "./grippable.js";

describe("Grippable", () => {
  it("grip.open-table-lifts-for-anyone — no grip anywhere in the chain", () => {
    const piece = node("p");
    expect(grippableBy(piece, "north")).toBe(true);
    expect(grippableBy(piece, "south")).toBe(true);
  });

  it("grip.a-hand-grips-to-its-owner — named seat lifts, others cannot", () => {
    const hand = node("hand", Grippable({ by: ["north"] }));
    expect(grippableBy(hand, "north")).toBe(true);
    expect(grippableBy(hand, "south")).toBe(false);
  });

  it("grip.empty-by-locks-everyone — a fixed board element", () => {
    const board = node("board", Grippable({ by: [] }));
    expect(grippableBy(board, "north")).toBe(false);
  });

  it("grip.grip-cuts-the-subtree — a card in a gripped hand is that seat's to lift", () => {
    const hand = node("hand", Grippable({ by: ["north"] }));
    const card = node("card");
    add(hand, card);
    expect(grippableBy(card, "north")).toBe(true);
    expect(grippableBy(card, "south")).toBe(false);
  });

  it("grip.a-child-cannot-reopen-a-gripped-owner — the ancestor cut wins", () => {
    const hand = node("hand", Grippable({ by: ["north"] }));
    const card = node("card", Grippable({ by: ["south"] }));
    add(hand, card);
    // south is named on the card but the north-gripped hand cuts above it; north lacks the card's grip.
    expect(grippableBy(card, "south")).toBe(false);
    expect(grippableBy(card, "north")).toBe(false);
  });

  it("grip.multiple-owners-name-a-seat — either listed seat may lift", () => {
    const shared = node("shared", Grippable({ by: ["north", "south"] }));
    expect(grippableBy(shared, "north")).toBe(true);
    expect(grippableBy(shared, "south")).toBe(true);
    expect(grippableBy(shared, "east")).toBe(false);
  });
});
