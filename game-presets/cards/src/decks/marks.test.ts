import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lettering, textWidth } from "./lettering.js";
import { JOKER_HAT, SUIT_MARKS, seat, type Mark } from "./marks.js";

const SUITS = new URL("../../art/suits/", import.meta.url).pathname;

function markOf(file: string): Mark {
  const svg = readFileSync(SUITS + file, "utf8");
  const vb = /viewBox="([^"]+)"/.exec(svg)![1]!.split(/\s+/).map(Number) as [number, number, number, number];
  return { viewBox: vb, d: /<path d="([^"]+)"/.exec(svg)![1]! };
}

describe("decks/marks", () => {
  it("marks.are-the-art's-own-paths — the table equals `art/suits/*.svg`, shape for shape", () => {
    for (const suit of ["spade", "heart", "diamond", "club"] as const) expect(SUIT_MARKS[suit]).toEqual(markOf(`${suit}.svg`));
    expect(JOKER_HAT).toEqual(markOf("joker-hat.svg"));
  });

  it("marks.seat-fits-whole — a tall mark in a square box is limited by its height, and centred", () => {
    // spade: 17×22 into a 10×10 box → scale 10/22, the box's centre mapped to the mark's own centre.
    expect(seat(SUIT_MARKS.spade, 50, 70, 10, 10)).toBe("translate(50,70) scale(0.455) translate(-0.5,0)");
    expect(seat(SUIT_MARKS.spade, 50, 70, 10, 10, 180)).toContain("rotate(180)");
  });

  it("lettering.is-rects-of-the-captured-font — one em per glyph, runs merged, an unknown letter throws", () => {
    expect(textWidth("10", 16)).toBe(32);
    const one = lettering("1", 0, 0, 8, "#000");
    // "1" is seven rows of ink, one run each — seven rects, at cell size 1.
    expect((one.match(/<rect /g) ?? []).length).toBe(7);
    expect(one).toContain('data-text="1"');
    expect(() => lettering("Ω", 0, 0, 8, "#000")).toThrow(/no glyph/);
  });
});
