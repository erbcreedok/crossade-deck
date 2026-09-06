import { HOME_ANCHOR } from "./presence.js";

/**
 * HOW MUCH GLASS IS LEFT ROUND THE DESK WHEN IT IS AS BIG AS IT MAY BE, in screen pixels.
 *
 * Not nothing: a rim touching the edge of the glass reads as a table that has been cut off rather
 * than one that just fits, and the shadow the felt casts is drawn outside its own circle.
 */
export const HOME_MARGIN = 8;

/** The desk as `homeZoom` has to measure it — an ask, what it is measured across, and how far it reaches. */
export interface HomeRoom {
  /** How many glass WIDTHS the desk asks to span at home (the round felt's `ROUND_HOME_SPAN`). */
  readonly span: number;
  /**
   * What `span` is measured across, in units — the felt itself, never the room round it. Absent,
   * `reach`, which is the room's own width as far as this reading is concerned: only the RATIO of
   * the two is ever read, so a desk that names neither is measured against itself either way.
   */
  readonly width?: number;
  /**
   * HOW FAR THE DESK REACHES AWAY FROM A PLACE, in units — a place is at the near rim and the far
   * rim is this much beyond it, which is what has to fit on the glass ABOVE the home anchor.
   * Absent, `width`: a round felt is as deep as it is wide.
   */
  readonly reach?: number;
}

/** WHAT IS ALREADY COVERING THE GLASS, in screen pixels, and so is not the desk's to be seen in. */
export interface HomeInsets {
  readonly top?: number;
}

/**
 * WHAT HOME IS WORTH AS A SPAN ON THIS GLASS — the desk's own ask (`room.span`), brought down until
 * the whole desk actually fits between whatever covers the top of the glass and the place at the
 * home anchor.
 *
 * The ask alone is a width and the glass has a height too. A place stands at `HOME_ANCHOR` — 0.82
 * down — and the desk reaches away from it towards the top; on a tall glass 1.5 widths of round
 * felt fits above that point, and on a short one (a phone in portrait with a browser's own bars
 * showing) the far rim is off the top of the screen. So the far rim, and not the ask, is the last
 * word: the table is smaller than asked for on a short glass and it is WHOLE, which is the picture
 * a player at a table has.
 *
 * Answered as a SPAN and not as a camera zoom, because a span is the one measure of a picture that
 * does not need the camera's etalon — hand it straight to `Camera.spanZoom(span, room.width)`.
 */
export function homeZoom(
  glass: { readonly w: number; readonly h: number },
  room: HomeRoom,
  insets: HomeInsets = {},
): number {
  const reach = room.reach ?? room.width ?? 1;
  const width = room.width ?? reach;
  if (glass.w <= 0 || reach <= 0 || width <= 0) return room.span;
  const room_h = glass.h * HOME_ANCHOR.y - (insets.top ?? 0) - HOME_MARGIN;
  // NO ROOM AT ALL IS NOT AN ANSWER. A glass shorter than its own top inset is a glass being
  // measured mid-layout, and a zoom of zero there would open the desk at a dot it never left.
  if (room_h <= 0) return room.span;
  const tall = ((room_h / reach) * width) / glass.w;
  return Math.min(room.span, tall);
}
