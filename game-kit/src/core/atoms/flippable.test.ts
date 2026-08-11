import { describe, expect, it } from "vitest";
import { type Atom } from "../atom.js";
import { node } from "../node.js";
import { Bounded } from "./bounded.js";
import { Surfaced } from "./surfaced.js";
import { Flippable, shownSurface } from "./flippable.js";
import { rect } from "../../presets/shapes.js";

const card = (...extra: Atom[]) => node("c", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "front" }), ...extra);

describe("Flippable", () => {
  it("flip.face-up-shows-the-front — the front is always the up-side", () => {
    expect(shownSurface(card(Flippable({ back: "cardBack" })), true)).toBe("front");
  });

  it("flip.face-down-shows-the-back — a named back is the down-side", () => {
    expect(shownSurface(card(Flippable({ back: "cardBack" })), false)).toBe("cardBack");
  });

  it("flip.empty-back-shows-the-front — same both sides, and a turn never blanks", () => {
    expect(shownSurface(card(Flippable({ back: "" })), false)).toBe("front");
  });

  it("flip.no-flippable-shows-the-front-both-ways — nothing to turn", () => {
    expect(shownSurface(card(), false)).toBe("front");
  });

  it("flip.no-surface-no-surface — with no Surfaced there is nothing to show", () => {
    expect(shownSurface(node("bare"), false)).toBeUndefined();
  });
});
