// HOW FAR THE VIEW MAY GO, AND HOW MUCH FELT IT IS ALLOWED TO SEE.
//
// Both answers are the SAME sentence for every desk — the difference between a card table and a
// chessboard is which room and which unit the sentence is read with, and those come from the game's
// own spec. Written once here, they cannot drift apart the way two copies of them already did.

import { HOME_ANCHOR, type CameraContent } from "game-kit";
import type { DeskSpec, Glass } from "./types.js";

/** How far the view may zoom, either way — the same range the catalog's maps open with. */
export const CAM_ZOOM = { minZoom: 0.5, maxZoom: 2.5 };

/**
 * HOW LONG THE GLIDE HOME TAKES, in ms — the kit's own default, named here because the OPENING is
 * the same glide run to its end in one step (see `startDesk`), and a number known to only one of the
 * two would open the desk part of the way to a place it then eased the rest of the way into.
 */
export const HOME_GLIDE_MS = 600;

/**
 * HOW FAR THIS DESK MAY BE ZOOMED, on THIS glass — the shelf's own limits, and the floor let down as
 * far as it takes for the WHOLE PAGE to fit the glass: the owner's rule, "the view can take in the
 * whole game zone". A desk whose page already fits at the floor keeps the floor.
 */
export function limitsOfDesk(spec: DeskSpec, glass: Glass): { readonly minZoom: number; readonly maxZoom: number } {
  const room = spec.room(spec.seats, glass);
  const fit = Math.min(glass.width / (room.w * spec.unit), glass.height / (room.h * spec.unit));
  return { minZoom: Math.min(CAM_ZOOM.minZoom, fit > 0 ? fit : CAM_ZOOM.minZoom), maxZoom: CAM_ZOOM.maxZoom };
}

/**
 * THE STRETCH THE CAMERA IS HELD INSIDE — the desk's OWN room, widened until every seat at it can
 * actually be brought under the reader on THIS glass.
 *
 * THE ROOM IS THE ONLY THING THAT DECIDES WHETHER A PLAYER CAN SIT DOWN. A place is on the rim, and
 * sitting at it means having it on the HOME ANCHOR of one's own glass — which is what `isHome` reads,
 * what the ring fills for and what the disc comes off the felt for. But `Camera.lookAt` clamps: a
 * room narrower than the glass is CENTRED rather than pinned, so the eye asked for a seat is put
 * back in the middle of the desk and nobody at it is ever home. A shelf's own margin is measured for
 * the catalog's short pane; on a phone held upright, half the glass is thirteen units of felt and the
 * room ran out after six — the glide ran, clamped, and came to rest in the middle, which is the
 * picture the table opened with on a phone and only on a phone.
 *
 * So the room is the desk's own plus half a glass BEHIND the furthest seat, measured at the widest
 * the view may ever be, which is the widest the clamp ever has to give way to.
 */
export function roomOfDesk(spec: DeskSpec, glass: Glass): CameraContent {
  const room = spec.room(spec.seats, glass);
  const floor = limitsOfDesk(spec, glass).minZoom;
  const behind = Math.max(glass.width, glass.height) / 2 / (spec.unit * floor);
  // ...AND THE EYE IS NOT AIMED AT THE SEAT. A place stands at the LOW middle of its owner's glass
  // (`HOME_ANCHOR`), so the point the camera is actually asked to look at is that much FURTHER back
  // than the ring — and it is the AIM the clamp refuses, not the ring. Measured at the widest the
  // view may ever be, exactly as `behind` is, because that is where the drop is worth the most felt.
  const drop = ((HOME_ANCHOR.y - 0.5) * glass.height) / (spec.unit * floor);
  const reach = Math.max(...spec.places(spec.seats).map(({ at }) => Math.hypot(at.x, at.y))) + behind + drop;
  // GROWN ROUND THE ROOM'S OWN MIDDLE, never shrunk: a desk that already declares more felt than this
  // asks for is a desk that has its own reason to, and half a glass is a floor, not a size.
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const half = { w: Math.max(room.w / 2, reach), h: Math.max(room.h / 2, reach) };
  return { x: cx - half.w, y: cy - half.h, w: half.w * 2, h: half.h * 2 };
}
