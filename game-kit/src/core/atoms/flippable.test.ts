import { describe, expect, it } from "vitest";
import { type Atom } from "../atom.js";
import { node } from "../node.js";
import { Bounded } from "./bounded.js";
import { Surfaced } from "./surfaced.js";
import { Flippable, shownFace } from "./flippable.js";
import { rect } from "../../presets/shapes.js";

const card = (...extra: Atom[]) => node("c", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "front" }), ...extra);

describe("Flippable", () => {
  it("flip.face-up-shows-the-front — the front is always up-side", () => {
    expect(shownFace(card(Flippable({ reverse: "back", back: "cardBack" })), true)).toEqual({
      surface: "front",
      mirror: false,
      axis: "y",
    });
  });

  it("flip.back-shows-the-back-surface — a separate reverse, usually a shared deck back", () => {
    expect(shownFace(card(Flippable({ reverse: "back", back: "cardBack" })), false)).toEqual({
      surface: "cardBack",
      mirror: false,
      axis: "y",
    });
  });

  it("flip.same-shows-the-front-either-side — a token identical both sides", () => {
    expect(shownFace(card(Flippable({ reverse: "same" })), false)).toEqual({ surface: "front", mirror: false, axis: "y" });
  });

  it("flip.mirror-flips-the-front-across-the-axis — the front seen from behind", () => {
    expect(shownFace(card(Flippable({ reverse: "mirror", axis: "x" })), false)).toEqual({
      surface: "front",
      mirror: true,
      axis: "x",
    });
  });

  it("flip.alt-shows-the-alternate-face — a per-card second face", () => {
    expect(shownFace(card(Flippable({ reverse: "alt", back: "altFace" })), false)).toEqual({
      surface: "altFace",
      mirror: false,
      axis: "y",
    });
  });

  it("flip.empty-back-falls-to-front — a turn never blanks the card", () => {
    // `back`/`alt` with no reverse surface named would otherwise show nothing; it shows the front.
    expect(shownFace(card(Flippable({ reverse: "back", back: "" })), false)?.surface).toBe("front");
  });

  it("flip.no-flippable-shows-the-front-both-ways — nothing to turn", () => {
    expect(shownFace(card(), false)).toEqual({ surface: "front", mirror: false, axis: "y" });
  });

  it("flip.no-surface-no-face — with no Surfaced there is no face to show", () => {
    expect(shownFace(node("bare"), false)).toBeUndefined();
  });
});
