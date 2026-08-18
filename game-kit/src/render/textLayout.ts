// WHERE THE LINES GO — the arithmetic between a string and a box, and nothing else.
//
// Pure, and separate from the plan, for the reason every other piece of geometry here is: a rule
// that lives inside the renderer is a rule jsdom cannot check, and wrapping is exactly the rule
// that breaks quietly. Hand it a ruler whose answers you chose and every case is a unit test —
// including the one that matters, a caption longer than the box it was designed against.
//
// THE KIT MEASURES IN PIXELS, NEVER IN CHARACTERS. A count of characters is a lie in any
// proportional face and a worse one across languages: the same eleven letters fit in one button
// and overflow the next. So every decision below asks the ruler.
//
// Everything here is in pixels, in the node's OWN space, around its origin — the same space a
// quad's contour is in, so the painter needs no second convention.

import { type FontSpec, type TextMeasure } from "./textMetrics.js";

/** One laid-out line: what to draw, and where its pen starts. */
export interface TextLine {
  readonly text: string;
  /** Pen start, pixels from the node's origin. */
  readonly x: number;
  /** BASELINE, pixels from the node's origin — not the top, which no font agrees on. */
  readonly y: number;
  /**
   * How far this line's tallest glyph rises above that baseline, pixels, straight from the ruler.
   *
   * It rides along because the PAINTER needs it: a renderer draws a string from the top of its
   * box, so reaching a baseline means subtracting an ascent, and a painter that guessed one would
   * disagree with the wrapping that was measured here. One ruler, one answer, no drift.
   */
  readonly ascent: number;
}

export interface TextLayout {
  readonly lines: readonly TextLine[];
  /** The widest line, pixels — what a box would have to be to hold this without wrapping further. */
  readonly width: number;
  /** Every line's height stacked, pixels. */
  readonly height: number;
}

export interface LayoutRequest {
  readonly text: string;
  readonly font: FontSpec;
  /** The area to fit inside, pixels. A width of zero or less means "do not wrap at all". */
  readonly width: number;
  /** Baseline-to-baseline distance as a multiple of the em size. */
  readonly lineHeight: number;
}

/**
 * Greedy wrapping on spaces, then centred as a block.
 *
 * Greedy rather than balanced because a caption is short and a reader expects the first line full;
 * balancing is a paragraph's problem and would need a second pass nobody has asked for.
 *
 * A WORD WIDER THAN THE BOX STILL GETS ITS OWN LINE and overflows. It is not cut and not
 * ellipsised: the kit's promise is to survive any length, and silently losing a player's word is
 * not surviving it. Making the box bigger is `boxFit`'s job, and the caller who wants a hard limit
 * asks for one.
 */
export function layoutText(req: LayoutRequest, measure: TextMeasure): TextLayout {
  const words = req.text.split(/\s+/).filter((w) => w.length > 0);
  const widthOf = (s: string): number => measure.measure(s, req.font).width;

  const rows: string[] = [];
  if (req.width > 0) {
    let row = "";
    for (const word of words) {
      const grown = row ? `${row} ${word}` : word;
      if (row && widthOf(grown) > req.width) {
        rows.push(row);
        row = word;
      } else {
        row = grown;
      }
    }
    if (row) rows.push(row);
  } else if (words.length > 0) {
    rows.push(words.join(" "));
  }

  const step = req.font.size * req.lineHeight;
  const widths = rows.map(widthOf);
  const width = widths.reduce((a, b) => Math.max(a, b), 0);
  const height = rows.length * step;

  // The block is centred on the origin, and the first baseline sits one ascent below its top.
  // Ascent comes from the ruler rather than from the em size, so a face with tall capitals is not
  // clipped by a box measured against a face without them.
  const top = -height / 2;

  const lines: TextLine[] = rows.map((text, i) => {
    const ascent = measure.measure(text, req.font).ascent;
    return { text, x: -(widths[i] ?? 0) / 2, y: top + i * step + ascent, ascent };
  });

  return { lines, width, height };
}
