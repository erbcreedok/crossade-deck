import { describe, expect, it } from "vitest";
import { fieldsOf, node, starved } from "../node.js";
import { Bounded } from "./bounded.js";
import { Valued, type ValuedFields } from "./valued.js";
import { faceOf, Rollable, rollable, setFace, sidesOf, withFace } from "./rollable.js";
import { actionsOf, installStockActions, perform, resetActions } from "../actions.js";
import { rect } from "../../presets/shapes.js";

describe("the rollable atom", () => {
  it("atom.rollable.carries-sides-and-reads-the-face — sides is the atom's, the face is a value", () => {
    // Presence is the capability; the number of faces is the one datum. Which face is up is NOT
    // here — it is `Valued.values.face`, read like any value a rule sums.
    const die = node("d", Bounded({ bounds: rect(1, 1) }), Valued({ values: { face: 3 } }), Rollable({ sides: 6 }));
    expect(rollable(die)).toBe(true);
    expect(sidesOf(die)).toBe(6);
    expect(faceOf(die)).toBe(3);
    const stone = node("s", Bounded({ bounds: rect(1, 1) }));
    expect(rollable(stone)).toBe(false);
    expect(sidesOf(stone)).toBeUndefined();
    expect(faceOf(node("v", Valued({ values: {} })))).toBeUndefined(); // never thrown: no face yet
  });

  it("atom.rollable.requires-a-place-for-the-face — a die without Valued is starved, not rollable", () => {
    const orphan = node("o", Bounded({ bounds: rect(1, 1) }), Rollable({ sides: 6 }));
    // `Valued` is required: with nowhere to keep a face the atom is STARVED — not a capability, and
    // the chain names what is missing — rather than a die that rolls into nothing.
    expect(rollable(orphan)).toBe(false);
    expect(starved(orphan).map((d) => d.name)).toEqual(["Rollable"]);
    expect(faceOf(orphan)).toBeUndefined();
    expect(withFace(orphan, 2)).toBe(orphan); // returned as it came
  });

  it("atom.rollable.face-is-written-as-truth — withFace clones, setFace writes in place, both refuse a face it has not", () => {
    const die = node("d", Valued({ values: { face: 1, colour: "red" } }), Rollable({ sides: 4 }));
    const thrown = withFace(die, 4);
    expect(faceOf(thrown)).toBe(4);
    expect(faceOf(die)).toBe(1); // the original is untouched
    expect(fieldsOf<ValuedFields>(thrown, "Valued")?.values["colour"]).toBe("red"); // other values kept
    setFace(die, 2);
    expect(faceOf(die)).toBe(2); // in place: identity kept for a live tree
    expect(() => setFace(die, 5)).toThrow(/4-sided/);
    expect(() => withFace(die, 0)).toThrow();
    expect(() => withFace(die, 2.5)).toThrow();
  });

  it("action.roll-offered-for-a-rollable — the verb follows the capability and lands a legal face", () => {
    resetActions();
    installStockActions();
    const die = node("d", Valued({ values: {} }), Rollable({ sides: 20 }));
    expect(actionsOf(die).map((a) => a.name)).toEqual(["roll"]);
    for (let i = 0; i < 50; i++) {
      const f = faceOf(perform("roll", die));
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(20);
    }
    expect(perform("roll", node("bare"))).toBeTruthy(); // a node that cannot roll is returned as it came
    resetActions();
  });
});
