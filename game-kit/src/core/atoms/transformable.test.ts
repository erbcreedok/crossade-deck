import { describe, expect, it } from "vitest";
import { classOf } from "../atom.js";
import { add, caps, node, remove } from "../node.js";
import { Transformable, resolveZ } from "./transformable.js";
import { Bounded } from "./bounded.js";
import { Container } from "./container.js";
import { contextFor, productAlongChain, sumAlongChain } from "../resolve.js";

describe("Transformable", () => {
  it("atom.transformable.needs-no-box — a pose needs no box", () => {
    // The desk is such a node: it is somewhere, and it occupies nothing of its own.
    expect(caps(node("t1", Transformable())).has("Transformable")).toBe(true);
  });

  it("atom.transformable.two-classes — this is the atom where they differ", () => {
    expect(classOf("Transformable", "at")).toBe("own");
    expect(classOf("Transformable", "z")).toBe("addsUp");
  });

  it("inherit.own.not-inherited — a position is never inherited", () => {
    const root = node("t2", Transformable({ at: { x: 5, y: 5 } }));
    const child = node("t3");
    add(root, child);
    // The child did not acquire the owner's position by standing in it.
    expect(child.atoms.has("Transformable")).toBe(false);
  });

  it("inherit.sum.adds — lift the stack and everything in it rises", () => {
    const root = node("t4", Transformable({ z: 10 }));
    const child = node("t5", Transformable({ z: 2 }));
    add(root, child);
    expect(resolveZ(contextFor(child, 100))).toBe(12);
  });

  it("ctx.read-at-apply — never frozen when an animation starts", () => {
    // client1 broke the fan's z-order three times over exactly this: a base captured when a
    // flight began, while the fan could collapse mid-flight underneath it.
    const high = node("t6", Transformable({ z: 10 }));
    const low = node("t7", Transformable({ z: 1 }));
    const card = node("t8", Transformable({ z: 2 }));

    add(high, card);
    expect(resolveZ(contextFor(card, 100))).toBe(12);

    remove(high, card);
    add(low, card);
    expect(resolveZ(contextFor(card, 100))).toBe(3);
  });

  it("inherit.sum.skips-the-silent — a node that never said z contributes nothing", () => {
    const root = node("t9");
    const child = node("t10", Transformable({ z: 4 }));
    add(root, child);
    expect(resolveZ(contextFor(child, 100))).toBe(4);
  });
});

describe("Transformable · the pose composes", () => {
  it("atom.transformable.angle-adds-up — a child cannot un-turn its owner", () => {
    const desk = node("t10", Container({ layout: "free" }), Transformable({ angle: 30 }));
    const card = node("t11", Bounded(), Transformable({ angle: 15 }));
    add(desk, card);
    // Read off the resolved chain, not stored: an animation that froze the base is how the fan
    // z-order broke three times in the first client.
    expect(sumAlongChain(contextFor(card, 100), "Transformable", "angle")).toBe(45);
  });

  it("atom.transformable.scale-multiplies — a half in a half is a quarter", () => {
    // The one field that composes this way, and the reason `multiplies` exists as a class: the
    // neutral value is ONE, and a sum would read a missing scale as "gone".
    const hand = node("t12", Container({ layout: "free" }), Transformable({ scale: 0.5 }));
    const card = node("t13", Bounded(), Transformable({ scale: 0.5 }));
    add(hand, card);
    expect(productAlongChain(contextFor(card, 100), "Transformable", "scale")).toBe(0.25);
    // And a node that says nothing about scale changes nothing.
    const plain = node("t14", Bounded());
    add(hand, plain);
    expect(productAlongChain(contextFor(plain, 100), "Transformable", "scale")).toBe(0.5);
  });
});
