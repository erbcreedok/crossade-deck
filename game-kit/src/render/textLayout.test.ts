// Wrapping is the rule that breaks quietly: it is right on the machine it was written on and
// wrong on the next font, the next language, the next screen. So it is measured against a RULER
// WHOSE ANSWERS ARE CHOSEN HERE — ten pixels a character, flat — and every case below is then a
// statement about the arithmetic rather than about whoever's font happened to be installed.

import { describe, expect, it } from "vitest";
import { layoutText } from "./textLayout.js";
import { type FontSpec, type TextMeasure } from "./textMetrics.js";

const FONT: FontSpec = { family: "test", size: 20, weight: 400 };

/** A monospace ruler: every character is `advance` wide, the em splits 80/20 about the baseline. */
const ruler = (advance = 10): TextMeasure => ({
  ready: Promise.resolve(),
  measure: (text, font) => ({ width: text.length * advance, ascent: font.size * 0.8, descent: font.size * 0.2 }),
});

const req = (text: string, width: number) => ({ text, font: FONT, width, lineHeight: 1.2 });

describe("layoutText", () => {
  it("text.one-line-fits — a caption inside its box stays one line, centred on the origin", () => {
    const out = layoutText(req("ab cd", 200), ruler());
    expect(out.lines.map((l) => l.text)).toEqual(["ab cd"]);
    // 5 characters at 10 = 50 wide, so the pen starts half of that to the left of the origin.
    expect(out.width).toBe(50);
    expect(out.lines[0]!.x).toBe(-25);
  });

  it("text.wraps-on-the-ruler-not-the-character-count — the break is where the pixels ran out", () => {
    // Room for four characters. "aaa bbb" measures 70 and must break; the count never enters it.
    const out = layoutText(req("aaa bbb", 40), ruler());
    expect(out.lines.map((l) => l.text)).toEqual(["aaa", "bbb"]);
    // Two lines of 20px em at 1.2 — the block is 48 tall and centred, so the first baseline sits
    // one ascent below its top.
    expect(out.height).toBeCloseTo(48);
    expect(out.lines[0]!.y).toBeCloseTo(-24 + 16);
    expect(out.lines[1]!.y - out.lines[0]!.y).toBeCloseTo(24);
  });

  it("text.a-word-wider-than-the-box-survives — it overflows, it is never cut", () => {
    // The kit's promise is to survive any length. Losing a player's word silently is not surviving
    // it, and where the box should have grown is `boxFit`'s question, not this one's.
    const out = layoutText(req("aaaaaaaa", 30), ruler());
    expect(out.lines.map((l) => l.text)).toEqual(["aaaaaaaa"]);
    expect(out.width).toBe(80);
  });

  it("text.a-wider-ruler-breaks-earlier — the same string, the same box, a fatter face", () => {
    // The same call twice, differing only in the ruler: this is the whole reason measuring is a
    // port. A face that measures wider must wrap sooner, with nothing else changed.
    const narrow = layoutText(req("aa bb cc", 60), ruler(10));
    const wide = layoutText(req("aa bb cc", 60), ruler(20));
    expect(narrow.lines).toHaveLength(2);
    expect(wide.lines).toHaveLength(3);
  });

  it("text.no-width-does-not-wrap — a caption with nothing to fit inside stays one run", () => {
    const out = layoutText(req("aa bb cc", 0), ruler());
    expect(out.lines.map((l) => l.text)).toEqual(["aa bb cc"]);
  });

  it("text.empty-lays-out-nothing — an absent caption is not an empty line", () => {
    const out = layoutText(req("   ", 100), ruler());
    expect(out.lines).toEqual([]);
    expect(out.height).toBe(0);
  });
});
