// THE TEXT STYLES A DESK KNOWS, BY NAME — the same registry shape as surfaces and layouts, and
// for the same reason: a node carries a short, stable NAME, and what the name is worth is decided
// in one place. Swap what `hub/title` means and every title on the desk changes at once.
//
// A ROLE, not a font. "Title" and "body" are what a tree can say and a designer can re-decide; a
// family and a size are what a theme answers. The canon puts it as "fonts and sizes come through
// the THEME, and the kit answers only how it looks, never what language it is in".
//
// One style per name, and the size in UNITS — pixels happen at the plan's edge, or a caption would
// be one size on a laptop and another on a phone.

import { type Paint } from "../core/paint.js";

export interface TextStyle {
  /** The family stack, already written the way the platform expects it. */
  readonly family: string;
  /** Em size, in UNITS. */
  readonly size: number;
  /** 400 is regular, 700 bold — the CSS numbers, because every platform speaks them. */
  readonly weight: number;
  /** Baseline to baseline, as a multiple of the em. */
  readonly lineHeight: number;
  /** A token, so one style reads correctly on both palettes without being written twice. */
  readonly fill: Paint;
}

/**
 * The style a caption gets when it names none — and the one the kit ships so that text is
 * measurable out of the box. A consumer with an opinion registers its own and names it.
 */
export const DEFAULT_TEXT: TextStyle = {
  family: "ui-sans-serif, system-ui, sans-serif",
  size: 0.26,
  weight: 400,
  lineHeight: 1.25,
  fill: "text",
};

const STYLES = new Map<string, TextStyle>();

export function registerTextStyle(name: string, style: TextStyle): void {
  STYLES.set(name, style);
}

/**
 * `undefined` for a name nobody registered — skipped, not thrown, exactly as a dangling surface
 * reference is. A caption in the desk's default face is a far better outcome than a scene that
 * refuses to draw, and the plan falls back for precisely that reason.
 */
export function textStyle(name: string): TextStyle | undefined {
  return STYLES.get(name);
}

export function textStyleNames(): readonly string[] {
  return [...STYLES.keys()];
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetTextStyles(): void {
  STYLES.clear();
}
