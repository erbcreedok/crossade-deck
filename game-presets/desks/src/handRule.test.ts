// WHAT A HAND HOLDS, AND WHAT IT DOES NOT — the rule a dealing desk plays its heaps by.
//
// A hand is an ARRAY of its owner's cards, and the wiring that mirrors it (a HUD, another screen)
// has to be able to say exactly which events change it. So the rule is written as data about three
// things and nothing else: what the hand's own handle lifts, which loose cards near it count, and
// that a card lying beside the box is never islanded with the cards inside it.

import { describe, expect, it } from "vitest";
import {
  add,
  Bounded,
  Carry,
  fieldsOf,
  Flippable,
  Heaping,
  heapsOf,
  installStockCoats,
  isGrip,
  isPlaceGrip,
  node,
  rect,
  regrip,
  remove,
  Transformable,
  type Node,
  type TransformableFields,
} from "game-kit";
import { handRule } from "./handRule.js";
import { HAND_SCALE, handRoom, layHand } from "./handZone.js";
import { mayTake, seatChair } from "./seatPlace.js";

installStockCoats();

const CARD = { w: 1, h: 1.4 };
const card = (id: string, x = 0, y = 0): Node =>
  node(id, Bounded({ bounds: rect(CARD.w, CARD.h) }), Transformable({ at: { x, y } }), Flippable({ flip: "" }), Heaping({ heap: "card" }), Carry({ orient: "holder" }));

/** A dealing desk: one held hand at the origin, two cards in it, and a loose card beside it. */
function dealt(): { desk: Node; hand: Node } {
  const desk = node("desk", Bounded({ bounds: rect(12, 12) }));
  const hand = seatChair("south", { at: { x: 0, y: 0 } }, { ink: "accent", hand: true });
  add(desk, hand);
  add(hand, card("mine 1"));
  add(hand, card("mine 2"));
  layHand(hand);
  return { desk, hand };
}

describe("what a hand holds", () => {
  it("hand.a-hand-has-no-handle — the cards at a chair are an indicator, and nothing lifts them off the felt", () => {
    // THE OWNER'S RULE: the cards at a chair are small and looked at, not played — no tab under the
    // hand lifts them, and a card thrown onto the box is on the felt, in a heap of its own, until
    // somebody puts it in properly. A hand is played from through its pictures on the owner's glass.
    const { desk, hand } = dealt();
    const rule = handRule();
    expect(rule.held, "no handle's row for a hand").toBeUndefined();
    add(desk, card("stray", 0.4, -handRoom() / 2));
    add(desk, card("stray 2", 0.6, -handRoom() / 2));
    const tabs = regrip(desk, () => "card", undefined, () => false, undefined, rule);
    const placeTab = desk.children.find((n) => isPlaceGrip(n));
    expect(placeTab, "no tab under the hand").toBeUndefined();
    expect([...tabs.values()].some((run) => run.some((p) => p.id === "mine 1")), "nothing lifts the hand's own cards").toBe(false);
    // THE STRAYS ON THE BOX ARE A FELT HEAP OF THEIR OWN, with a tab anybody may take — they were
    // not put in the hand, so they are not the hand's.
    const feltTabs = desk.children.filter((n) => isGrip(n) && !isPlaceGrip(n));
    expect(feltTabs).toHaveLength(1);
    expect(tabs.get(feltTabs[0]!.id)!.map((p) => p.id).sort()).toEqual(["stray", "stray 2"]);
    expect(mayTake(feltTabs[0]!, "north")).toBe(true);
    // ...AND THE HAND'S OWN CARDS ARE SMALL, and a card out of it is its own size again: the size
    // is the chair's, put on by the lay and taken off by the settle that finds the card elsewhere.
    for (const c of hand.children) expect(fieldsOf<TransformableFields>(c, "Transformable")?.scale).toBe(HAND_SCALE);
    const out = hand.children[0]!;
    remove(hand, out);
    add(desk, out);
    rule.settled!(desk, [out.id]);
    expect(fieldsOf<TransformableFields>(out, "Transformable")?.scale ?? 1, "its own size on the felt").toBe(1);
    expect(fieldsOf<TransformableFields>(hand.children[0]!, "Transformable")?.scale, "the one still in the hand stays small").toBe(HAND_SCALE);
  });

  it("hand.a-stray-is-never-islanded-with-the-hand — touching the box is not touching the cards in it", () => {
    // ON THE FELT, TOUCHING IS A HEAP and a heap gets a handle. Inside a hand the cards touch each
    // other by design, and a card thrown onto the box touches them too — and a handle grown out of
    // that island would lift the stray and half the hand as one felt heap. The hand's cards are the
    // hand's, and the ordinary rule never sees them.
    const { desk } = dealt();
    const rule = handRule();
    add(desk, card("stray", 0.4, -handRoom() / 2));
    add(desk, card("stray 2", 0.6, -handRoom() / 2));
    const heaps = heapsOf(desk, () => "card", () => false, rule).map((g) => g.map((n) => n.id).sort());
    // The two strays on the felt touch each other and heap; nothing in the hand is in any heap.
    expect(heaps).toEqual([["stray", "stray 2"]]);
    // A felt heap far away gets a tab of its own, anybody's, as it always was.
    add(desk, card("heap 1", 5, 5));
    add(desk, card("heap 2", 5.3, 5));
    regrip(desk, () => "card", undefined, () => false, undefined, rule);
    const feltTabs = desk.children.filter((n) => isGrip(n) && !isPlaceGrip(n));
    expect(feltTabs).toHaveLength(2);
    for (const tab of feltTabs) expect(mayTake(tab, "north")).toBe(true);
  });
});
