// THE LAWS THIS FILE EXISTS FOR: a slider's two directions are exact inverses, a segmented row has
// exactly one member on, and a caption is not a control.
//
// The rest of these presets is composition a reader can check by looking. These three are the parts
// where a mistake is invisible: an inverse that is off by half a knob feels like a sticky slider, a
// row with two members on looks like a row with one until the wrong one is read.

import { describe, expect, it } from "vitest";
import { caps, fieldsOf } from "../core/node.js";
import { registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout, rowLayout } from "../core/atoms/layouts.js";
import { type CoatedFields } from "../core/atoms/coated.js";
import { type LabeledFields } from "../core/atoms/labeled.js";
import { installStockControls } from "./controls.js";
import { installStockSurfaces } from "./surfaces.js";
import { rect } from "./shapes.js";
import { badge, knobAt, label, panel, slider, toggle, toggles, valueAt } from "./widgets.js";

installStockSurfaces();
installStockControls();
resetLayouts();
registerLayout("free", freeLayout);
registerLayout("row", rowLayout({ gap: 0.1, padding: 0 }));

describe("the interface presets", () => {
  it("widgets.a-caption-is-not-a-control — it declines by carrying nothing", () => {
    // The one every interface builds by accident out of a button with its background switched off.
    // A caption is a different thing and says so: no press, no meaning, no plate.
    const words = label("score", { text: "Score" });
    expect(caps(words).has("Pressable")).toBe(false);
    expect(caps(words).has("Valued")).toBe(false);
    expect(caps(words).has("Surfaced")).toBe(false);
    expect(fieldsOf<LabeledFields>(words, "Labeled")?.label).toBe("Score");
  });

  it("widgets.a-slider-reads-back-what-it-was-shown — the two directions are inverses", () => {
    for (const width of [1, 2.85, 7]) {
      for (const v of [0, 0.13, 0.5, 0.77, 1]) {
        expect(valueAt(knobAt(v, width), width), `${v} at width ${width}`).toBeCloseTo(v, 10);
      }
    }
    // And both ends clamp rather than run off: a finger dragged past the track is at the end of it.
    expect(valueAt(knobAt(-5, 2), 2)).toBe(0);
    expect(valueAt(knobAt(5, 2), 2)).toBe(1);
    expect(valueAt(Number.NaN, 2)).toBe(0);
    expect(knobAt(Number.NaN, 2)).toBe(knobAt(0, 2));
  });

  it("widgets.a-slider-puts-its-knob-where-the-value-is", () => {
    const s = slider("speed", { value: 0.5, width: 3 });
    expect(s.children).toHaveLength(1);
    expect(knobAt(0, 3)).toBe(-1.5); // the far left of a three-unit track
    expect(knobAt(1, 3)).toBe(1.5);
  });

  it("widgets.exactly-one-segment-is-on — and it is the chosen one", () => {
    const row = toggles("pace", {
      options: [
        { value: "slow", label: "Slow" },
        { value: "normal", label: "Normal" },
        { value: "fast", label: "Fast" },
      ],
      chosen: "normal",
      layout: "row",
    });
    const lit = row.children.filter((c) => fieldsOf<CoatedFields>(c, "Coated") !== undefined);
    expect(lit).toHaveLength(1);
    expect(lit[0]!.id).toBe("pace/normal");
  });

  it("widgets.a-toggle-keeps-no-state-of-its-own — the game holds it", () => {
    // Two calls, two different answers, one source of truth. The tree cannot disagree with the game
    // about which one is on, because the tree was built from it.
    expect(fieldsOf<CoatedFields>(toggle("sound", { on: true, label: "Sound" }), "Coated")).toBeDefined();
    expect(fieldsOf<CoatedFields>(toggle("sound", { on: false, label: "Sound" }), "Coated")).toBeUndefined();
  });

  it("widgets.a-panel-carries-its-title-on-its-own-node — captions are drawn in the middle", () => {
    // A panel's own `Labeled` would put the heading across the middle of the dialog. It rides a
    // node placed at the top instead, and that node is FIRST so a column layout starts below it.
    const box = panel("pause", { bounds: rect(4, 3), title: "Paused", layout: "free" });
    expect(fieldsOf<LabeledFields>(box, "Labeled")).toBeUndefined();
    expect(box.children[0]!.id).toBe("pause/title");
    expect(fieldsOf<LabeledFields>(box.children[0]!, "Labeled")?.label).toBe("Paused");
  });

  it("widgets.a-badge-grows-sideways — one and one hundred are the same object", () => {
    const one = badge("n1", { text: "1" });
    const many = badge("n2", { text: "128", width: 0.6 });
    for (const b of [one, many]) expect(caps(b).has("Pressable"), "a badge is read, never pressed").toBe(false);
    expect(fieldsOf<LabeledFields>(many, "Labeled")?.label).toBe("128");
  });
});
