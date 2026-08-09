import { describe, expect, it } from "vitest";
import { atomDef } from "../atom.js";
import { add, caps, node } from "../node.js";
import { Bakeable, bakeable } from "./bakeable.js";
import { Bounded } from "./bounded.js";
import { Container } from "./container.js";
import { Surfaced } from "./surfaced.js";
import { starved } from "../node.js";

describe("Bakeable", () => {
  it("atom.bakeable.presence-is-the-whole-statement — no field to say no with", () => {
    // The canon's rule, and the reason this atom has no fields: capability by presence,
    // restriction by absence. A `bake: false` field would be the `disabled` flag the model
    // does not have, and it would give two ways to say one thing.
    expect(Object.keys(atomDef("Bakeable")!.defaults)).toEqual([]);
    expect(bakeable(node("b1", Bounded(), Surfaced(), Bakeable()))).toBe(true);
    expect(bakeable(node("b2", Bounded(), Surfaced()))).toBe(false);
  });

  it("atom.bakeable.needs-a-surface — baking is an operation on a quad", () => {
    // A node that paints nothing produces no quad, so the atom on it would be a control over
    // nothing — the mistake `fit` and `align` made on `Surfaced` before they moved to the layer.
    const alone = node("b3", Bakeable());
    expect(starved(alone).map((def) => def.name)).toContain("Bakeable");
    const painted = node("b4", Bounded(), Surfaced(), Bakeable());
    expect(starved(painted)).toEqual([]);
  });

  it("atom.bakeable.is-not-inherited — a resting desk does not freeze the card on it", () => {
    // The case the whole predicate exists for: a still desk with one card being dealt over it.
    // Inheriting would bake the card along with the desk and take the flight's matrix away.
    const desk = node("b5", Container({ layout: "free" }), Surfaced(), Bakeable());
    const card = node("b6", Bounded(), Surfaced());
    add(desk, card);
    expect(caps(card).has("Bakeable")).toBe(false);
    expect(bakeable(card)).toBe(false);
  });
});
