import { describe, expect, it } from "vitest";
import { add, node } from "../node.js";
import { Bounded } from "./bounded.js";
import { Container } from "./container.js";
import { Draggable, draggable, onRejectOf } from "./draggable.js";
import { Focusable, focusable } from "./focusable.js";
import { Private, visibleTo } from "./private.js";
import { rect } from "../../presets/shapes.js";

const box = () => Bounded({ bounds: rect(1, 1) });

describe("interaction & visibility atoms", () => {
  it("atom.draggable.is-a-capability — presence says the element can be picked up", () => {
    expect(draggable(node("d1", box(), Draggable()))).toBe(true);
    expect(draggable(node("d2", box()))).toBe(false); // a footprint, but not draggable
  });

  it("atom.draggable.reject-policy — home or stay when a drop is refused", () => {
    expect(onRejectOf(node("d3", box(), Draggable({ onReject: "stay" })))).toBe("stay");
    expect(onRejectOf(node("d4", box(), Draggable()))).toBe("home"); // safe default
    expect(onRejectOf(node("d5", box()))).toBeUndefined(); // not draggable at all
  });

  it("atom.focusable.is-a-marker — presence says it can take focus, absence declines", () => {
    expect(focusable(node("f1", box(), Focusable()))).toBe(true);
    expect(focusable(node("f2", box()))).toBe(false);
  });

  it("atom.private.hides-the-subtree — a private hand hides its cards from everyone but its owner", () => {
    const desk = node("pr1", Container({ layout: "free" }));
    const hand = node("pr2", Container({ layout: "free" }), Private({ access: ["me"] }));
    const card = node("pr3", box());
    add(desk, hand);
    add(hand, card);
    expect(visibleTo(hand, "me")).toBe(true);
    expect(visibleTo(hand, "you")).toBe(false);
    expect(visibleTo(card, "me")).toBe(true); // owner sees the whole subtree
    expect(visibleTo(card, "you")).toBe(false); // the cut reaches the child too
  });

  it("atom.private.public-child-is-fine — a private child in a public container, the reverse case", () => {
    // Privacy cuts DOWN, not up: a private node hides itself and below, but its public owner and
    // siblings stay visible to everyone.
    const desk = node("pr4", Container({ layout: "free" }));
    const secret = node("pr5", box(), Private({ access: ["me"] }));
    const open = node("pr6", box());
    add(desk, secret);
    add(desk, open);
    expect(visibleTo(desk, "you")).toBe(true); // the public container is not hidden by a private child
    expect(visibleTo(open, "you")).toBe(true); // the sibling is untouched
    expect(visibleTo(secret, "you")).toBe(false); // only the private one is cut
  });

  it("atom.private.default-hides-from-all — an empty access list is private to everyone", () => {
    const sealed = node("pr7", box(), Private());
    expect(visibleTo(sealed, "me")).toBe(false);
    expect(visibleTo(sealed, "you")).toBe(false);
  });
});
