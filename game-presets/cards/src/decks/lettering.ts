// LETTERING — an index set in the deck's pixel font, as rects. See `glyphs.ts` on why a texture
// cannot simply ask for the font: an SVG loaded as an image sees no page fonts, and a baking script
// sees no fonts at all. Eight cells to the em, runs of ink merged into one rect each, so a "10"
// is a dozen rects and not a hundred.

import { GLYPHS } from "./glyphs.js";

/** How wide a text runs at a font size: every glyph advances one em. */
export function textWidth(text: string, size: number): number {
  return [...text].length * size;
}

/**
 * The text with its top-left corner at (x, y), `size` units to the em. Throws for a character the
 * capture did not cover — a silent blank is the failure that reaches a player, a throw reaches a test.
 */
export function lettering(text: string, x: number, y: number, size: number, fill: string): string {
  const cell = size / 8;
  const rects: string[] = [];
  [...text].forEach((ch, i) => {
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`no glyph captured for "${ch}"`);
    glyph.forEach((row, r) => {
      let c = 0;
      while (c < 8) {
        if (row[c] !== "#") {
          c += 1;
          continue;
        }
        let run = 0;
        while (c + run < 8 && row[c + run] === "#") run += 1;
        rects.push(
          `<rect x="${fmt(x + (i * 8 + c) * cell)}" y="${fmt(y + r * cell)}" width="${fmt(run * cell)}" height="${fmt(cell)}"/>`,
        );
        c += run;
      }
    });
  });
  return `<g data-text="${text}" fill="${fill}" shape-rendering="crispEdges">${rects.join("")}</g>`;
}

/** Three decimals is a hundredth of a pixel at the baked size — enough, and a texture stays short. */
export function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}
