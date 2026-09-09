// THE CARD'S PAPER — the numbers every face and every back stand on. Drawn 100×140, the engine's
// own 1×1.4 proportion, and declared 400×560 pixels so a renderer that rasterises the vector once
// (the pixi loader does) keeps it sharp at a desktop card and not only at a phone's.
//
// The design measures its edges in PIXELS of a 62px-wide card (a 2px keyline, a 6px inset) and
// everything else in fractions of the width; `px()` carries the pixel numbers over unchanged.

/** Drawn size, in the texture's own units. */
export const W = 100;
export const H = 140;
/** The corner, `0.1w` in the design. */
export const R = W * 0.1;

/** The design's reference card width, in CSS pixels — what its pixel measures are relative to. */
const REFERENCE_PX = 62;

/** A pixel measure of the design, in units. */
export function px(n: number): number {
  return (n * W) / REFERENCE_PX;
}

/** The raster the vector is declared at — four times the drawn size. */
export const PIXELS = { w: 400, h: 560 } as const;

/** A whole document: the paper's viewBox, the declared pixels, the body. */
export function doc(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${PIXELS.w}" height="${PIXELS.h}">${body}</svg>`;
}

/** SVG text as a data URI. Encoded, not base64 — the source stays readable in the network tab. */
export function dataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * THE KEYLINE — the edge of every face and back. The design drew it 2px black; on the felt a
 * stack of twenty cards turned that into a black staircase, one edge per card. So it is thin and
 * WHITE: a single card still has a contour against the dark, and a stack's edges read as paper.
 */
export const KEYLINE = { paint: "#ffffff", width: 1 } as const;

/** The paper's edge and its stock: the white keyline, the cream inside it. */
export function keyline(stock: string): string {
  return paperRect(0, `fill="${KEYLINE.paint}"`) + paperRect(px(KEYLINE.width), `fill="${stock}"`);
}

/** A rounded rect inset `inset` units from every edge of the paper, its corner shrunk to match. */
export function paperRect(inset: number, attrs: string): string {
  const r = Math.max(0, R - inset);
  return `<rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${H - 2 * inset}" rx="${r}" ry="${r}" ${attrs}/>`;
}
