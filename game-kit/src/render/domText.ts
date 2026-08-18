// THE BROWSER'S ANSWER to `TextMeasure` — a 2D context, asked politely, and its answers remembered.
//
// It is a separate file from the contract for the reason the contract states: the plan must be able
// to depend on the QUESTION without a DOM anywhere near it. This file is the only one in the kit
// that knows a font engine exists.
//
// TWO TRAPS, both paid for already in an earlier client.
//
//   - A WEB FONT IS NOT MEASURABLE UNTIL IT HAS ARRIVED. Measure before it lands and the numbers
//     are the fallback's — every caption then lays out to the wrong width and settles there, since
//     nothing re-measures on its own. Hence `ready`, and hence `waitFor`.
//   - A FONT SERVICE SHIPS SUBSETS BY CODEPOINT RANGE. Asking for a font without saying which
//     letters fetches one subset alone, and the first caption outside it silently renders in the
//     fallback. So a wait carries a SAMPLE — text whose glyphs are the ones this desk will actually
//     show — and the kit never looks at what is in it.

import { type FontSpec, type Glyphs, type TextMeasure } from "./textMetrics.js";

/** One font this desk will use, and text whose glyphs force the subsets it needs. */
export interface FontWait {
  readonly font: FontSpec;
  /**
   * Any string whose codepoints cover what will be drawn. The kit does not read it, does not know
   * what it says, and never will — it is a hint for the font service, nothing more.
   */
  readonly sample: string;
}

export interface DomTextOptions {
  /** Fonts to have in hand before `ready` settles. Empty means "measure whatever is loaded". */
  readonly waitFor?: readonly FontWait[];
}

/** The CSS shorthand a 2D context wants. The one place a font becomes a string. */
function cssFont(f: FontSpec): string {
  return `${f.weight} ${f.size}px ${f.family}`;
}

/**
 * A measurer over an offscreen 2D context.
 *
 * The context is made once and never attached to the document: it is a ruler, not a picture, and
 * measuring must not cost a layout. Answers are cached by font and text — a still scene re-measures
 * nothing, and a caption that has not changed costs a map lookup.
 */
export function domTextMeasure(options: DomTextOptions = {}): TextMeasure {
  let pen: CanvasRenderingContext2D | undefined;
  const context = (): CanvasRenderingContext2D | undefined => {
    if (pen) return pen;
    const sheet = globalThis.document?.createElement("canvas");
    pen = sheet?.getContext("2d") ?? undefined;
    return pen;
  };

  const cache = new Map<string, Glyphs>();
  const fonts = globalThis.document?.fonts;

  const ready = (async () => {
    if (!fonts) return;
    try {
      // The sample is what fetches the right subsets; `fonts.ready` alone would settle happily
      // with only the ranges the page happened to touch.
      await Promise.all((options.waitFor ?? []).map((w) => fonts.load(cssFont(w.font), w.sample)));
      await fonts.ready;
    } catch {
      // Offline, or a service that never answers: measure with the fallback rather than hang. A
      // caption in the wrong face is a poor picture; a desk that never draws is no picture at all.
    }
    cache.clear(); // anything measured while waiting was measured against the fallback
  })();

  return {
    ready,
    measure(text, font) {
      const key = `${cssFont(font)} ${text}`;
      const seen = cache.get(key);
      if (seen) return seen;
      const ruler = context();
      let out: Glyphs = { width: 0, ascent: font.size * 0.8, descent: font.size * 0.2 };
      if (ruler) {
        ruler.font = cssFont(font);
        const m = ruler.measureText(text);
        // The two verticals are optional in older engines; the em-box split is the honest fallback
        // and is what a font without them would round to anyway.
        out = {
          width: m.width,
          ascent: m.actualBoundingBoxAscent ?? font.size * 0.8,
          descent: m.actualBoundingBoxDescent ?? font.size * 0.2,
        };
      }
      cache.set(key, out);
      return out;
    },
  };
}
