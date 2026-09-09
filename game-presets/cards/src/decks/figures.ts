// A COURT FIGURE ON THE PAPER — where the engraving sits, and the two ways it gets there.
//
// A king is a drawing, not a pip layout, so the courts keep their asset: `art/courts/<id>.svg`,
// the figure ALONE (its card's own white rect cut away by the source deck), its viewBox the box of
// its ink. The design seats it `contain` inside a 6px inset of the frame, centred. That one
// placement is computed here and used twice:
//
//   - INLINE, for a baked texture and for tests: the figure's text is nested into the face
//     document, with `color` set to the accent the style asks for.
//   - AS A FILE, for the vector skin at runtime: an SVG loaded as an image cannot be told a
//     colour, and a surface layer fits a picture to the whole card, not to an inset — so the
//     baking script writes the figure out with its accent painted in and its viewBox PADDED,
//     such that fitting the padded picture to the whole card lands the ink exactly where the
//     inline placement does. `figures.test.ts` holds the two to each other.

import { H, PIXELS, W, px } from "./card.js";
import { fmt } from "./lettering.js";

export type ViewBox = readonly [number, number, number, number];
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The design's `inset:6px` — deep enough to read as the figure's frame, not eating the face. */
export const FIGURE_INSET = px(6);

/** The area a figure is fitted into. */
export function figureBox(): Box {
  return { x: FIGURE_INSET, y: FIGURE_INSET, w: W - 2 * FIGURE_INSET, h: H - 2 * FIGURE_INSET };
}

/** Where a figure of the given viewBox lands: contained in `figureBox()`, centred. */
export function figurePlacement(viewBox: ViewBox): Box {
  const box = figureBox();
  const [, , vw, vh] = viewBox;
  const s = Math.min(box.w / vw, box.h / vh);
  const w = vw * s;
  const h = vh * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/**
 * The figure's viewBox widened to the whole paper: a picture with THIS viewBox, fitted to the
 * card, shows the ink at `figurePlacement`. Pure arithmetic on the placement's scale.
 */
export function paddedViewBox(viewBox: ViewBox): ViewBox {
  const [vx, vy, vw] = viewBox;
  const at = figurePlacement(viewBox);
  const s = at.w / vw;
  return [vx - at.x / s, vy - at.y / s, W / s, H / s];
}

/** The viewBox a figure file declares. Throws for a file without one: every figure is read by it. */
export function viewBoxOf(svg: string): ViewBox {
  const m = /viewBox="([^"]+)"/.exec(svg);
  if (!m) throw new Error("a figure without a viewBox");
  const [x, y, w, h] = m[1]!.trim().split(/[\s,]+/).map(Number);
  if ([x, y, w, h].some((n) => n === undefined || !Number.isFinite(n))) throw new Error(`a figure with a bad viewBox: ${m[1]}`);
  return [x!, y!, w!, h!];
}

/** The figure nested into a face document at its placement, wearing `paint` as its accent. */
export function inlineFigure(svg: string, paint: string): string {
  const at = figurePlacement(viewBoxOf(svg));
  const open = /<svg\b[^>]*>/.exec(svg);
  if (!open) throw new Error("a figure that is not an svg document");
  const attrs = open[0]
    .slice(4, -1)
    .replace(/\s(width|height|x|y)="[^"]*"/g, "");
  return svg.replace(
    open[0],
    `<svg x="${fmt(at.x)}" y="${fmt(at.y)}" width="${fmt(at.w)}" height="${fmt(at.h)}" color="${paint}"${attrs}>`,
  );
}

/** The figure as a file of its own, accent painted in and viewBox padded to the paper. */
export function standaloneFigure(svg: string, paint: string): string {
  const padded = paddedViewBox(viewBoxOf(svg)).map(fmt).join(" ");
  // Declared at the paper's pixels: a loader that rasterises the file once (pixi does) would
  // otherwise draw it at the viewBox's own size and stretch that.
  return svg
    .replace(/viewBox="[^"]+"/, `viewBox="${padded}" width="${PIXELS.w}" height="${PIXELS.h}"`)
    .replaceAll("currentColor", paint);
}
