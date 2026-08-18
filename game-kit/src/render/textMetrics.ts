// HOW WIDE IS THIS STRING — the one thing the kit cannot compute and must be told.
//
// A port, in the same shape and for the same reason as `Painter`: the contract lives away from any
// implementation of it, so the plan can depend on the QUESTION without dragging in whoever answers
// it. The plan is a pure function and has to stay one — jsdom has no font engine any more than it
// has WebGL — so measuring arrives as an INPUT (`PlanInput.measure`), and a test hands it a ruler
// whose answers it chose. That is what makes wrapping and box fitting checkable at all.
//
// Absent, nothing is measured and a caption simply does not lay out — the same "skip it, do not
// throw" the kit gives a surface name nobody registered. A scene that never asked for text is
// byte-for-byte the scene it always was.
//
// Everything here is in PIXELS, because that is the only place a glyph has a size: units are the
// model's measure and a font's is not. The plan converts at the boundary, exactly as it does for
// every other length.

/** A font, fully resolved — no roles, no tokens, no cascade left to read. */
export interface FontSpec {
  /** The family stack, already written the way the platform expects it. */
  readonly family: string;
  /** Em size, in pixels. */
  readonly size: number;
  /** 400 is regular, 700 bold — the CSS numbers, because every platform speaks them. */
  readonly weight: number;
}

/** What one run of text occupies. Widths advance; the two verticals are from the baseline. */
export interface Glyphs {
  /** How far the pen moves, in pixels. */
  readonly width: number;
  /** Above the baseline, positive, pixels. */
  readonly ascent: number;
  /** Below the baseline, positive, pixels. */
  readonly descent: number;
}

export interface TextMeasure {
  /**
   * A font is not measurable until it has arrived, and a fallback's numbers are not the font's.
   * Callers may ignore this exactly as they may ignore a painter's: measuring early answers with
   * whatever is loaded, which is what a scene that mounts and paints in one breath will do.
   */
  readonly ready: Promise<void>;
  /** The advance and the two verticals for this run in this font. Pure: same input, same answer. */
  measure(text: string, font: FontSpec): Glyphs;
}
