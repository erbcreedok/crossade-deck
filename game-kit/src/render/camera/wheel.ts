// THE WHEEL — three answers about a mouse wheel, and none of them a camera's state.
//
// Apart from the camera because they are decisions about the PAGE, not about the view: whether the
// desk may take this wheel at all is a question about what is around the canvas.

import { ZOOM_SENS } from "./limits.js";

/**
 * WHO GETS THE WHEEL — the desk or the page.
 *
 * One rule: never take the wheel when taking it would stop the page being read. Zoom with a
 * modifier always means zoom. Panning is claimed only where the desk IS the page; on a page holding
 * several desks with prose between them, a canvas eating the wheel reads as a hung site rather than
 * as a desk that will not scroll.
 */
export function wheelGoesToCamera(o: { zoom: boolean; canPan: boolean; inDocument: boolean }): boolean {
  if (o.zoom) return true;
  if (o.inDocument) return false;
  return o.canPan;
}

/** A wheel delta in pixels, whatever unit the browser reported it in. */
export function wheelPixels(deltaY: number, deltaMode: number, screenHeight: number): number {
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * screenHeight : deltaY;
}

/** The zoom factor a wheel notch is worth. A ratio, so out-and-back lands exactly where it began. */
export const wheelZoomFactor = (pixels: number, sensitivity = ZOOM_SENS): number => Math.exp(-pixels * sensitivity);
