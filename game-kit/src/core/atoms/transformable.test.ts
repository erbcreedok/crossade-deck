import { describe, expect, it } from "vitest";
import { classOf } from "../atom.js";
import { add, caps, node, remove } from "../node.js";
import { contextFor } from "../resolve.js";
import { Transformable, resolveZ } from "./transformable.js";

describe("Transformable", () => {
  it("atom.transformable.needs-no-box — a pose needs no box", () => {
    // The tabletop is such a node: it is somewhere, and it occupies nothing of its own.
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
