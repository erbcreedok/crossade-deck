// THE LAWS THIS FILE EXISTS FOR: a button is the atoms it declared and no others, a ring costs a
// second node ONLY when the look asks for one, and the press lands on the outer plate.
//
// The last one is not pedantry. Hit-testing the inner face leaves a dead ring the width of the
// inset around every control in the game — a miss that reads as "the button is flaky" and is
// invisible in a screenshot.

import { describe, expect, it } from "vitest";
import { button } from "./button.js";
import { rect } from "./shapes.js";
import { caps, fieldsOf } from "../core/node.js";
import { extentOf, footprint } from "../core/atoms/bounded.js";
import { type LabeledFields } from "../core/atoms/labeled.js";
import { pressableOf } from "../core/atoms/pressable.js";
import { type SurfacedFields } from "../core/atoms/surfaced.js";
import { CONTROL_LABEL, CONTROL_LABEL_ON, CONTROL_LOOKS, installStockControls, lookSurface } from "./controls.js";
import { type ValuedFields } from "../core/atoms/valued.js";
import "../core/atoms/coated.js";

installStockControls();

describe("the button preset", () => {
  it("button.one-line-is-a-whole-button — the preset is not a form to fill in", () => {
    // THE POINT OF THE PRESET. No surface registered by hand, no text style, no box, no feel: a
    // caption and what it means, and what comes back is a control that is already dressed. The
    // version before this one made a designer write four registrations first, which is homework.
    const b = button("undo", { label: "Undo", means: { does: "undo" } });
    expect(caps(b).has("Bounded")).toBe(true);
    expect(caps(b).has("Surfaced")).toBe(true);
    expect(caps(b).has("Pressable")).toBe(true);
    expect(fieldsOf<ValuedFields>(b, "Valued")?.values).toEqual({ does: "undo" });
    expect(fieldsOf<LabeledFields>(b, "Labeled")?.label).toBe("Undo");
  });

  it("button.a-look-is-a-name — a fifth one costs a registration, never a branch", () => {
    for (const look of CONTROL_LOOKS) {
      const b = button(`b-${look}`, { look, label: look });
      expect(fieldsOf<SurfacedFields>(b, "Surfaced")?.surface).toBe(lookSurface(look));
    }
    // A name the kit never heard of is a game's own record, and it reaches the node untouched.
    expect(fieldsOf<SurfacedFields>(button("mine", { look: "mine" }), "Surfaced")?.surface).toBe("control/mine");
  });

  it("button.a-fill-is-a-fill — the stock looks are ONE node, not a ring around a face", () => {
    // The mistake this rung was born for: every stock look used to be a plate with a face covering
    // it, so the fill only ever showed as a ring and a plain blue button could not be made at all.
    const plain = button("undo", { label: "Undo" });
    expect(plain.children).toHaveLength(0);
    expect(fieldsOf<LabeledFields>(plain, "Labeled")?.label).toBe("Undo");

    // A game whose motif genuinely IS a ring names both records itself, and then there are two.
    const ringed = button("undo2", { face: "mine/face", label: "Undo" });
    expect(ringed.children).toHaveLength(1);
    expect(ringed.children[0]!.id).toBe("undo2/face");
  });

  it("button.words-on-a-fill-get-the-other-role — or they vanish into it", () => {
    // `text` is light because the desk is dark; on a bright accent it disappears. The role follows
    // the look, so nobody writes a colour at a call site to fix it.
    expect(fieldsOf<LabeledFields>(button("p", { look: "primary", label: "Go" }), "Labeled")?.style).toBe(CONTROL_LABEL_ON);
    expect(fieldsOf<LabeledFields>(button("q", { look: "quiet", label: "Go" }), "Labeled")?.style).toBe(CONTROL_LABEL);
  });

  it("button.the-press-lands-on-the-outer-plate — not on the inner face", () => {
    const b = button("hint", { bounds: rect(2, 0.7), face: "mine/face", inset: 0.06, means: { does: "hint" } });
    expect(caps(b).has("Pressable")).toBe(true);
    expect(caps(b.children[0]!).has("Pressable")).toBe(false);
    // And the meaning rides the same node the finger hits, so the handler reads it off the pick.
    expect(fieldsOf<ValuedFields>(b, "Valued")?.values).toEqual({ does: "hint" });
  });

  it("button.the-caption-sits-inside-the-ring — on whichever node shows the face", () => {
    const ringed = button("again", { face: "mine/face", label: "Again" });
    expect(fieldsOf<LabeledFields>(ringed, "Labeled")).toBeUndefined();
    expect(fieldsOf<LabeledFields>(ringed.children[0]!, "Labeled")?.label).toBe("Again");

    const plain = button("again2", { label: "Again" });
    expect(fieldsOf<LabeledFields>(plain, "Labeled")?.label).toBe("Again");
  });

  it("button.the-inset-is-a-real-inset — the face is smaller by it on every side", () => {
    const b = button("undo3", { bounds: rect(2, 1), face: "mine/face", inset: 0.1 });
    const inner = footprint(b.children[0]!)!;
    const { w, h } = extentOf(inner);
    expect(w).toBeCloseTo(1.8, 10); // 2 − 0.1 on each side
    expect(h).toBeCloseTo(0.8, 10);
  });

  it("button.what-has-no-default-stays-absent — absence is still the refusal", () => {
    // The look, the box and the feel have answers, because a control without them is not a
    // control. What a press MEANS, where it sits, what it holds and what shadow it lays have no
    // sensible default at all — a guessed meaning would be a button doing something nobody asked.
    const bare = button("bare");
    for (const absent of ["Valued", "ShadowCaster", "Transformable", "Container"]) {
      expect(caps(bare).has(absent), `${absent} was composed though nothing asked for it`).toBe(false);
    }
    expect(fieldsOf<LabeledFields>(bare, "Labeled")).toBeUndefined(); // no words, no caption
  });

  it("button.the-feel-defaults-live-in-the-atom — the preset does not keep a second copy", () => {
    const stock = pressableOf(button("a", { bounds: rect(1, 1) }))!;
    const mine = pressableOf(button("b", { bounds: rect(1, 1), sink: 0, nudge: { x: 0, y: 0 } }))!;
    // A flat control is a legitimate design, and it has to be reachable — which is only true if the
    // preset passes a given zero through instead of reading it as "nothing given".
    expect(mine.sink).toBe(0);
    expect(mine.nudge).toEqual({ x: 0, y: 0 });
    expect(stock.sink).not.toBe(0);
    expect(stock.hover).toEqual(mine.hover); // untouched fields still come from the one place
  });
});
