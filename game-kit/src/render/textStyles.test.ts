// A role is a NAME, and what it is worth is one entry — the same bargain a surface strikes. The
// case that matters is the one nobody writes a test for: a name nobody registered must fall back,
// not throw, or one typo in a tree takes the whole desk down.

import { afterEach, describe, expect, it } from "vitest";
import { Bounded } from "../core/atoms/bounded.js";
import { Container } from "../core/atoms/container.js";
import { Labeled } from "../core/atoms/labeled.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { add, node } from "../core/node.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { rect } from "../presets/shapes.js";
import { registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { resetSurfaces } from "./surfaces.js";
import { scenePlan } from "./scenePlan.js";
import { DEFAULT_TEXT, registerTextStyle, resetTextStyles, textStyle } from "./textStyles.js";
import { type TextMeasure } from "./textMetrics.js";

const ruler: TextMeasure = {
  ready: Promise.resolve(),
  measure: (text, font) => ({ width: text.length * 10, ascent: font.size * 0.8, descent: font.size * 0.2 }),
};

const BIG = { family: "Loud", size: 1, weight: 700, lineHeight: 1.5, fill: "accent" as const };

afterEach(() => resetTextStyles());

describe("text styles", () => {
  it("text.a-role-is-a-name — one entry decides what every caption wearing it looks like", () => {
    expect(textStyle("hub/title")).toBeUndefined();
    registerTextStyle("hub/title", BIG);
    expect(textStyle("hub/title")).toEqual(BIG);
  });

  it("text.a-caption-too-big-for-its-box-shrinks — the box wins, and the word survives whole", () => {
    resetLayouts();
    registerLayout("free", freeLayout);
    resetSurfaces();
    installStockSurfaces();
    // A role whose em is a whole unit: in a box one unit tall, one line of it cannot fit.
    registerTextStyle("huge", { family: "Loud", size: 1, weight: 400, lineHeight: 1.4, fill: "text" });

    const capIn = (w: number, h: number, style: string) => {
      const desk = node(`d${w}x${h}${style}`, Container({ layout: "free" }), Surfaced());
      add(desk, node("cap", Bounded({ bounds: rect(w, h) }), Labeled({ label: "aaaa", style })));
      const plan = scenePlan({ root: desk, unit: 100, width: 800, height: 600, viewer: DEFAULT_VIEWER, measure: ruler });
      return plan.find((q) => q.id === "cap")!.text!;
    };

    // Roomy: nothing is touched, and the em is the role's own.
    expect(capIn(12, 4, "huge").font.size).toBe(100);
    // Cramped: the em comes down so the block fits, and the caption is still the whole word — the
    // kit shrinks rather than cutting, because losing a player's word is not surviving its length.
    const tight = capIn(1.2, 0.6, "huge");
    expect(tight.font.size).toBeLessThan(100);
    expect(tight.lines.map((l) => l.text).join("")).toContain("aaaa");
  });

  it("text.an-unknown-role-falls-back — a typo must not take the desk down", () => {
    resetLayouts();
    registerLayout("free", freeLayout);
    resetSurfaces();
    installStockSurfaces();
    registerTextStyle("hub/title", BIG);

    const build = (style: string) => {
      const desk = node(`d-${style || "none"}`, Container({ layout: "free" }), Surfaced());
      add(desk, node("cap", Bounded({ bounds: rect(4, 2) }), Labeled({ label: "ab", style })));
      return scenePlan({ root: desk, unit: 100, width: 800, height: 600, viewer: DEFAULT_VIEWER, measure: ruler });
    };
    const sizeOf = (style: string) => build(style).find((q) => q.id === "cap")!.text!.font.size;

    // The named role rules...
    expect(sizeOf("hub/title")).toBe(BIG.size * 100);
    // ...and a name nobody registered gets the desk's default face rather than an exception.
    expect(sizeOf("hub/nonesuch")).toBe(DEFAULT_TEXT.size * 100);
    expect(sizeOf("")).toBe(DEFAULT_TEXT.size * 100);
  });
});
