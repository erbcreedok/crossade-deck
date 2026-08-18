// A BOX WITH A CAPTION IN IT — how big it gets, and how much the caption has to give way.
//
// Pure arithmetic on numbers, deliberately away from anything that draws. It started life on a
// button and does not belong to one: a box with words inside is also a drop zone, a slot's
// nameplate, a badge and a tooltip. Left on the button, each of those would grow its own rules —
// slightly different ones, and they would drift apart in silence. So there is one arithmetic and
// four callers, which is the whole reason this is a file rather than four private helpers.
//
// It takes MEASURED text and returns numbers, so every rule here is a unit test rather than a
// screenshot somebody has to squint at. The lengths carry no meaning of their own: hand it units
// and it answers in units, hand it pixels and it answers in pixels. It never learns which.
//
// Not to be confused with `fitBox` next door, which answers the opposite question — where a
// PICTURE lands inside an area that already has a size. This one decides the size.

/** How a box chooses its extent. */
export type BoxFit =
  /** From the preset. A row of these stands even, which matters more than packing them tightly. */
  | "preset"
  /** From the CONTENT: the caption's own size plus padding. A long caption makes a wider box. */
  | "content";

/** Which way a caption is asked to fit. The two are different demands and must not be conflated. */
export type FitAxis = "horizontal" | "vertical" | "both";

export interface BoxSpec {
  /** Where `preset` fitting starts from. */
  readonly preset: { readonly w: number; readonly h: number };
  /** The caption's natural size, already measured, at scale 1. */
  readonly text: { readonly w: number; readonly h: number };
  readonly fit?: BoxFit;
  readonly padding?: number;
  /** An exact extent. It beats both the preset and content fitting — but NOT the bounds. */
  readonly width?: number;
  readonly height?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
}

/** Hold a number between bounds. An absent bound lets the value through untouched. */
export function clampSize(v: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? 0, v));
}

/**
 * The box's extent.
 *
 * The order is fixed, and it is also the answer to "what beats what": how it is fitted, then an
 * explicit width or height, then the bounds. THE BOUNDS COME LAST and apply to every case,
 * including an explicit extent — otherwise `maxWidth` would silently not hold an exact width,
 * which is the one situation people set it for.
 */
export function boxSize(s: BoxSpec): { w: number; h: number } {
  const pad = s.padding ?? 0;
  const byContent = s.fit === "content";
  // Width pads on both sides, height on one: a caption sits on its baseline, and the room under
  // it is the descender's, not a second margin.
  let w = byContent ? s.text.w + pad * 2 : s.preset.w;
  let h = byContent ? s.text.h + pad : s.preset.h;
  if (s.width !== undefined) w = s.width;
  if (s.height !== undefined) h = s.height;
  return { w: clampSize(w, s.minWidth, s.maxWidth), h: clampSize(h, s.minHeight, s.maxHeight) };
}

export interface CaptionFit {
  readonly box: { readonly w: number; readonly h: number };
  readonly text: { readonly w: number; readonly h: number };
  readonly padding?: number;
  /** Shrink when it does not fit. On by default — the usual thing a caller wants. */
  readonly shrink?: boolean;
  /** Grow when there is room to spare. Off by default: nobody expects a caption to swell. */
  readonly grow?: boolean;
  readonly axis?: FitAxis;
  /** The floor below which the caption stops being readable. */
  readonly minScale?: number;
}

/**
 * How much to scale the caption. 1 leaves it alone.
 *
 * BOTH axes are computed and `axis` picks: "it fits across" and "it fits down" are different
 * demands, and answering one when asked the other is how a caption ends up clipped by the edge
 * nobody was watching.
 *
 * `minScale` is a floor and not a decoration. Below it the caption stops being readable, and
 * "it fits" becomes a formality — better it visibly overflows than invisibly disappears.
 */
export function captionScale(s: CaptionFit): number {
  const pad = s.padding ?? 0;
  // The divisor is held at 1 so an unmeasured caption cannot divide by zero and put NaN through
  // every size downstream — the same defence the plan makes for a zero unit.
  const kx = (s.box.w - pad * 2) / Math.max(1, s.text.w);
  const ky = (s.box.h - pad) / Math.max(1, s.text.h);
  const k = s.axis === "horizontal" ? kx : s.axis === "vertical" ? ky : Math.min(kx, ky);
  if (k < 1 && (s.shrink ?? true)) return Math.max(s.minScale ?? 0.3, k);
  if (k > 1 && s.grow) return k;
  return 1;
}
