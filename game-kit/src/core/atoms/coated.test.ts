import { describe, expect, it } from "vitest";
import { classOf } from "../atom.js";
import { atomDef } from "../atom.js";
import { Coated, hasCoat, NO_COAT, type Coat } from "./coated.js";

describe("Coated — the runtime coat, as data", () => {
  it("coated.fields-and-classes — self is own, cast cascades from the owner", () => {
    // The REACH is the class, not a branch: `self` stays on the face, `cast` falls to the subtree.
    expect(classOf("Coated", "self")).toBe("own");
    expect(classOf("Coated", "cast")).toBe("fromOwner");
  });

  it("coated.defaults-are-empty — a fresh Coated draws nothing until a recipe is named", () => {
    const fields = Coated().fields;
    expect(fields.self).toEqual(NO_COAT);
    expect(fields.cast).toEqual(NO_COAT);
    expect(NO_COAT.recipe).toBe("");
  });

  it("coated.no-requirement — a node may cast over children while drawing nothing itself", () => {
    // Unlike Surfaced, Coated demands no area: a bare cascading container is legal, the effect
    // simply skips painting it and its cast still reaches the children.
    expect(atomDef("Coated")!.requires).toEqual([]);
  });

  it("coated.has-coat — a coat draws only when its recipe is named", () => {
    expect(hasCoat(NO_COAT)).toBe(false);
    expect(hasCoat({ recipe: "wash", level: 0.5, tint: "accent" })).toBe(true);
    // Empty recipe with a level set is still no coat: the recipe is what there is to look up.
    expect(hasCoat({ recipe: "", level: 0.9, tint: "accent" })).toBe(false);
  });

  it("coated.tint-carries-a-parametric-colour — the infinite palette rides the atom as data", () => {
    // A team hue is a token name plus a number, and the spec stays serialisable — no function, no
    // hex — so `defineAtom`'s guard passes and the coat crosses the wire.
    const coat: Coat = { recipe: "wash", level: 0.6, tint: { token: "spin", param: 0.33 } };
    expect(() => Coated({ self: coat })).not.toThrow();
    expect(Coated({ self: coat }).fields.self.tint).toEqual({ token: "spin", param: 0.33 });
  });
});
