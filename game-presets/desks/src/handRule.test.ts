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
  Flippable,
  Heaping,
  heapsOf,
  installStockCoats,
  isGrip,
  isPlaceGrip,
  node,
  rect,
  regrip,
  Transformable,
  type Node,
} from "game-kit";
import { gripOwner, handRule } from "./handRule.js";
import { handRoom } from "./handZone.js";
import { chairId, mayTake, seatChair, setHandLock } from "./seatPlace.js";

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
  return { desk, hand };
}

describe("what a hand holds", () => {
  it("hand.the-handle-lifts-the-hand-and-what-lies-on-it — its own cards always, a stray only while the hand is open", () => {
    const { desk, hand } = dealt();
    const rule = handRule();
    // A CARD THROWN ONTO THE HAND lies on the box — most of it over the outline — and is NOT in the
    // hand: it was not put there, it landed there. It is not a child, so a HUD mirroring the hand
    // never shows it.
    const stray = card("stray", 0.4, -handRoom() / 2);
    add(desk, stray);
    const far = card("far", 5, 5);
    add(desk, far);
    const held = rule.held!(desk, () => false);
    expect(held).toHaveLength(1);
    expect(held[0]!.under.id).toBe(chairId("south"));
    // ...BUT THE HANDLE TAKES IT UP WITH THE HAND: lifted by the owner's own tab, the cards in the
    // hand and the cards lying on it come up as one run and fall into line — which is the ONE way a
    // stray joins the hand short of somebody dropping it in properly. The far card stays out.
    expect(held[0]!.pieces.map((n) => n.id)).toEqual(["mine 1", "mine 2", "stray"]);
    // LOCKED, THE HAND IS ITS OWN CARDS AND NOTHING ELSE: a shut hand takes nothing from above, not
    // by a drop and not by a lift.
    setHandLock(hand, true);
    expect(rule.held!(desk, () => false)[0]!.pieces.map((n) => n.id)).toEqual(["mine 1", "mine 2"]);
    // ...AND A HAND HOLDING NOTHING STILL HAS ITS HANDLE'S ROW — empty — so the tab is not drawn.
    setHandLock(hand, false);
    for (const c of [...hand.children]) hand.children.splice(hand.children.indexOf(c), 1);
    expect(rule.held!(desk, () => false)[0]!.pieces.map((n) => n.id)).toEqual(["stray"]);
  });

  it("hand.a-stray-is-never-islanded-with-the-hand — touching the box is not touching the cards in it", () => {
    // ON THE FELT, TOUCHING IS A HEAP and a heap gets a handle. Inside a hand the cards touch each
    // other by design, and a card thrown onto the box touches them too — and a handle grown out of
    // that island would lift the stray and half the hand as one felt heap, with the hand's own tab
    // lifting the other half. The hand's cards are the hand's, and the ordinary rule never sees them.
    const { desk } = dealt();
    const rule = handRule();
    add(desk, card("stray", 0.4, -handRoom() / 2));
    add(desk, card("stray 2", 0.6, -handRoom() / 2));
    const heaps = heapsOf(desk, () => "card", () => false, rule).map((g) => g.map((n) => n.id).sort());
    // The two strays on the felt touch each other and heap; nothing in the hand is in any heap.
    expect(heaps).toEqual([["stray", "stray 2"]]);
    // ...AND THE PLACE'S HANDLE IS THE OWNER'S: the tab `regrip` draws for the hand says whose it is,
    // so `mayTake` can refuse every other finger — a hand lifted whole by a neighbour is a hand dealt
    // away.
    const tabs = regrip(desk, () => "card", undefined, () => false, undefined, rule);
    const placeTab = desk.children.find((n) => isPlaceGrip(n) && tabs.get(n.id)?.some((p) => p.id === "mine 1"));
    expect(placeTab, "the hand has a handle of its own").toBeDefined();
    expect(gripOwner(placeTab!)).toBe("south");
    expect(mayTake(placeTab!, "south"), "the owner lifts their own hand").toBe(true);
    expect(mayTake(placeTab!, "north"), "…and nobody else does").toBe(false);
    // The felt heap's tab is anybody's, as it always was — and the strays on the box get none of
    // their own: claimed by the hand's handle, they are not a felt heap any more.
    add(desk, card("heap 1", 5, 5));
    add(desk, card("heap 2", 5.3, 5));
    regrip(desk, () => "card", undefined, () => false, undefined, rule);
    const feltTabs = desk.children.filter((n) => isGrip(n) && !isPlaceGrip(n));
    expect(feltTabs).toHaveLength(1);
    expect(mayTake(feltTabs[0]!, "north")).toBe(true);
  });
});
