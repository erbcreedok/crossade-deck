import { describe, expect, it } from "vitest";
import { add, node } from "../node.js";
import { Bounded } from "./bounded.js";
import { Container } from "./container.js";
import { Draggable, draggable, onRejectOf } from "./draggable.js";
import { Focusable, focusable } from "./focusable.js";
import { Rotatable, restAngle, rotatable } from "./rotatable.js";
import { Transformable } from "./transformable.js";
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

  it("atom.rotatable.is-a-capability — presence says the element can be turned by hand", () => {
    expect(rotatable(node("r1", box(), Transformable(), Rotatable()))).toBe(true);
    expect(rotatable(node("r2", box(), Transformable()))).toBe(false); // it has an angle, nobody may set it
  });

  it("atom.rotatable.release-policy — keep, home, or snap to the nearest step", () => {
    const pose = Transformable({ angle: 15 });
    // KEEP is the default, and it is the OPPOSITE of a drag's on purpose: a refused drop is a
    // refusal, and returning is the safe answer to one. Nothing refuses a turn — the player turned
    // the piece because they meant to, and undoing that by default makes the atom useless.
    expect(restAngle(node("k", box(), pose, Rotatable()), 37, 15)).toBe(37);
    expect(restAngle(node("h", box(), pose, Rotatable({ onRelease: "home" })), 37, 15)).toBe(15);
    expect(restAngle(node("s", box(), pose, Rotatable({ onRelease: "snap", snap: 90 })), 37, 15)).toBe(0);
    expect(restAngle(node("s2", box(), pose, Rotatable({ onRelease: "snap", snap: 90 })), 200, 15)).toBe(180);
    // The nearest goes both ways, and negatives are not a special case.
    expect(restAngle(node("s3", box(), pose, Rotatable({ onRelease: "snap", snap: 60 })), -100, 0)).toBe(-120);
    // A grid of nothing is not a grid: dividing by it lands the piece on NaN, which reads on screen
    // as a piece that vanished.
    expect(restAngle(node("s4", box(), pose, Rotatable({ onRelease: "snap", snap: 0 })), 37, 15)).toBe(37);
    // And a node without the atom has no policy at all: it keeps whatever it was handed.
    expect(restAngle(node("n", box(), pose), 37, 15)).toBe(37);
  });

  it("atom.rotatable.is-not-a-tilt — a tap walks stops, fingers set anything, one angle holds both", () => {
    // Both may sit on one node without arguing: `Tiltable` is which of a few STOPS, this is a
    // continuous angle a hand chose, and the two write the same field.
    const both = node("t", box(), Transformable({ angle: 90 }), Rotatable({ onRelease: "home" }));
    expect(restAngle(both, 33, 90)).toBe(90);
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
