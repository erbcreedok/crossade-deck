// THE LAW THIS FILE EXISTS FOR: dressing a control for a pointer must GIVE BACK what it found.
//
// A control is very often already wearing something of its own — a toggle that is on, a tile
// filling with gold while its chunk loads, a hinted card. Undressing to "no coat" instead of to
// "what stood there" quietly erases that, and the bug looks like the other feature being broken.

import { describe, expect, it } from "vitest";
import { node, compose, fieldsOf } from "../node.js";
import { Bounded } from "./bounded.js";
import { Coated, NO_COAT, type CoatedFields } from "./coated.js";
import { rect } from "../../presets/shapes.js";
import { Pressable, pressableOf, wearPress } from "./pressable.js";

const control = () => node("undo", Bounded({ bounds: rect(1, 0.4) }), Pressable());
const wornOf = (n: ReturnType<typeof control>) => fieldsOf<CoatedFields>(n, "Coated")?.cast ?? NO_COAT;

describe("Pressable", () => {
  it("pressable.the-stock-feel-is-already-alive — a bare atom answers a finger", () => {
    const fields = pressableOf(control())!;
    expect(fields.hover.recipe).not.toBe("");
    expect(fields.held.recipe).not.toBe("");
    expect(fields.sink).toBeLessThan(0); // toward the desk
  });

  it("pressable.a-node-with-no-box-is-no-control — the atom requires a footprint", () => {
    // `Pressable` requires `Bounded`: a press lands on something with a contour to hit-test and to
    // dress. An unmet requirement makes the atom ABSENT, not inert — so the wiring never sees it.
    expect(pressableOf(node("naked", Pressable()))).toBeUndefined();
  });

  it("pressable.undressing-gives-back-what-it-found — not an empty coat", () => {
    const n = control();
    const own = { recipe: "fill", level: 0.4, tint: "accent" };
    compose(n, Coated({ self: NO_COAT, cast: own }));

    const undo = wearPress(n, "hover");
    expect(wornOf(n)).toEqual(pressableOf(n)!.hover);
    undo();
    expect(wornOf(n), "the control's own coat was erased by a pointer passing over it").toEqual(own);
  });

  it("pressable.the-coat-reaches-the-whole-control — the face is not left undressed", () => {
    // A stock control is a plate and a face that covers almost all of it. On `self` the hover would
    // tint a ring two hundredths of a unit wide and nothing else — which is how a hover that "did
    // nothing" shipped. `self` is the node's own business and is left exactly as it was found.
    const n = control();
    const own = { recipe: "ring", level: 0.6, tint: "accent" };
    compose(n, Coated({ self: own, cast: NO_COAT }));
    wearPress(n, "held");
    expect(fieldsOf<CoatedFields>(n, "Coated")?.cast).toEqual(pressableOf(n)!.held);
    expect(fieldsOf<CoatedFields>(n, "Coated")?.self, "the control's own face coat was overwritten").toEqual(own);
  });

  it("pressable.a-node-that-answers-nothing-is-untouched — dressing it is a no-op", () => {
    const plain = node("label", Bounded({ bounds: rect(1, 1) }));
    const undo = wearPress(plain, "hover");
    expect(fieldsOf<CoatedFields>(plain, "Coated")).toBeUndefined();
    undo();
    expect(fieldsOf<CoatedFields>(plain, "Coated")).toBeUndefined();
  });
});
