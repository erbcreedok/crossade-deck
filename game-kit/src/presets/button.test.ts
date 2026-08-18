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
import { type ValuedFields } from "../core/atoms/valued.js";
import "../core/atoms/coated.js";

describe("the button preset", () => {
  it("button.one-node-until-the-look-asks-for-two", () => {
    const plain = button("undo", { bounds: rect(2, 0.7), surface: "ui/plate", label: "Undo" });
    expect(plain.children).toHaveLength(0);

    const ringed = button("undo2", { bounds: rect(2, 0.7), surface: "ui/plate", face: "ui/face", inset: 0.05, label: "Undo" });
    expect(ringed.children).toHaveLength(1);
    expect(ringed.children[0]!.id).toBe("undo2/face");
  });

  it("button.the-press-lands-on-the-outer-plate — not on the inner face", () => {
    const b = button("hint", { bounds: rect(2, 0.7), surface: "ui/plate", face: "ui/face", inset: 0.06, means: { does: "hint" } });
    expect(caps(b).has("Pressable")).toBe(true);
    expect(caps(b.children[0]!).has("Pressable")).toBe(false);
    // And the meaning rides the same node the finger hits, so the handler reads it off the pick.
    expect(fieldsOf<ValuedFields>(b, "Valued")?.values).toEqual({ does: "hint" });
  });

  it("button.the-caption-sits-inside-the-ring — on whichever node shows the face", () => {
    const ringed = button("again", { bounds: rect(2, 0.7), surface: "ui/plate", face: "ui/face", inset: 0.05, label: "Again" });
    expect(fieldsOf<LabeledFields>(ringed, "Labeled")).toBeUndefined();
    expect(fieldsOf<LabeledFields>(ringed.children[0]!, "Labeled")?.label).toBe("Again");

    const plain = button("again2", { bounds: rect(2, 0.7), surface: "ui/plate", label: "Again" });
    expect(fieldsOf<LabeledFields>(plain, "Labeled")?.label).toBe("Again");
  });

  it("button.the-inset-is-a-real-inset — the face is smaller by it on every side", () => {
    const b = button("undo3", { bounds: rect(2, 1), surface: "ui/plate", face: "ui/face", inset: 0.1 });
    const inner = footprint(b.children[0]!)!;
    const { w, h } = extentOf(inner);
    expect(w).toBeCloseTo(1.8, 10); // 2 − 0.1 on each side
    expect(h).toBeCloseTo(0.8, 10);
  });

  it("button.a-field-left-out-leaves-its-atom-out — absence is the refusal", () => {
    const bare = button("bare", { bounds: rect(1, 1) });
    for (const absent of ["Surfaced", "Labeled", "Valued", "ShadowCaster", "Transformable", "Container"]) {
      expect(caps(bare).has(absent), `${absent} was composed though nothing asked for it`).toBe(false);
    }
    // What it DOES have: a box, and the capability that makes it a control at all.
    expect(caps(bare).has("Bounded")).toBe(true);
    expect(caps(bare).has("Pressable")).toBe(true);
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
