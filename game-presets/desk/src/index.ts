// THE NETWORKED DESK — one runtime, every table game on this shelf.
//
// A game hands in a `DeskSpec` (what it IS) and gets a running, wired, peopled desk back. What the
// game adds on top of the glass arrives as `DeskLayer`s; where it is being played arrives as a
// `DeskHost`. Nothing in this package knows the name of a single game, and a scan says so
// (`guards.test.ts`).

export { startDesk, type StartDeskOptions } from "./startDesk.js";
export { browserHost, frameClock, topInsetOf, type BrowserHostOptions, type DeskClock } from "./host.js";
export { CAM_ZOOM, HOME_GLIDE_MS, limitsOfDesk, roomOfDesk } from "./camera.js";
export { curtain, type Curtain } from "./curtain.js";
export { CURSOR_DOT, dotAt, farDots, needsPositioning, type FarDots } from "./cursors.js";
export {
  deskAvatarsTransport,
  deskSeats,
  inkOf,
  PRESENCE_EVERY_MS,
  SEAT_INKS,
  type DeskAvatarsTransport,
  type DeskAvatarsTransportOptions,
} from "./presence.js";
export type {
  DeskContext,
  DeskHost,
  DeskLayer,
  DeskSpec,
  Glass,
  HomeZoom,
  Room,
  SeatedPerson,
  Teardown,
} from "./types.js";
