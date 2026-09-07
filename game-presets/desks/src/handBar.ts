// THE BAR ABOVE A HAND — four controls on the far rim of a held place, outside its outline.
//
// A hand has three things its owner may say about it and one about the chair it is in: SHUT it
// (nobody else reaches in — the lock), HIDE it (everybody else sees backs), TURN IT OVER (every
// card in place, order untouched), and PIN the chair (nobody moves it, its owner included). The
// first two and the last are STATES and their controls stay lit while they hold; a flip is an act,
// and its control has nothing to light.
//
// THEY STAND ON THE DESK, in the chair's own frame: past the far rim — the side away from the owner,
// where they cover no card and no name — in a row across the owner's look, sized for the finger
// (`Screened`), with their glyphs upright to whoever is looking (`upright`), because a glyph read
// upside down is a glyph read wrong. They are the chair's furniture, like its tick and its name,
// and go where the chair goes (`fitChair`).
//
// EVERYBODY SEES THE STATES; ONLY THE OWNER PRESSES. The press is the kit's (`wireButtons`) and it
// reports every press on the glass; what a press MEANS is on the control (`Valued`: which control,
// whose hand), and the people wiring answers it only for the seat that owns it (`Avatars.pressed`).
//
// ...AND THEY ARE MADE TO BE HUNG ELSEWHERE. A hand mirrored onto a HUD carries the same four
// controls; `seatBar` builds them from a seat and an ink alone, and `fitBar` puts them along any
// rim it is given — nothing here knows it is standing on a chair.

import {
  add,
  button,
  byId,
  circle,
  Coated,
  compose,
  decompose,
  fieldsOf,
  HELD,
  node,
  NO_COAT,
  registerAsset,
  registerSurface,
  Screened,
  svg,
  Transformable,
  Valued,
  type Coat,
  type Node,
  type Paint,
  type TransformableFields,
  type ValuedFields,
} from "game-kit";
import { chairId, chairPinned, chairReach, isChair } from "./seatPlace.js";
import { handHidden, handLocked, isHand } from "./handZone.js";

/** What a control is for — the four, in the order they stand. */
export type BarWhat = "lock" | "hide" | "flip" | "pin";
export const BAR_WHATS: readonly BarWhat[] = ["lock", "hide", "flip", "pin"];

/**
 * THE BAR'S MEASURE, in units at zoom 1 — held on the glass (`Screened`), so a control is a tap
 * target at every zoom. `gap` is between controls and between the row and the rim.
 */
export const BAR = { size: 0.34, gap: 0.08 };

/** The key a control's meaning is written under — read by `barPress`, never parsed out of an id. */
const BAR_VALUE = "bar";
const BAR_SEAT = "barSeat";
const BAR_INK = "barInk";

/** How strongly a control that is ON is washed in its owner's ink — a status, read across the table. */
const LIT_WASH = 0.55;

const BAR_PLATE = "desk.seat.bar";

/** The id a control answers to. Built here, never parsed (`guard.id-is-opaque`). */
export function chairButtonId(seat: string, what: BarWhat): string {
  return `${chairBarId(seat)} ${what}`;
}

/**
 * THE ID OF THE BAR ITSELF — one node holding the four, and the one that is held on the glass
 * (`Screened`) and turned to the viewer. Sized as a whole so the row scales as a whole: four
 * controls each held on the glass but placed in desk units closed up into one lump the moment the
 * view zoomed out, and spread into a line across the table the moment it zoomed in.
 */
export function chairBarId(seat: string): string {
  return `${chairId(seat)} bar`;
}

/** A PADLOCK, shut. */
const LOCK_ICON = svg(
  24,
  24,
  '<g fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/>' +
    '<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></g>',
);
/** AN EYE, STRUCK THROUGH. */
const HIDE_ICON = svg(
  24,
  24,
  '<g fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/>' +
    '<circle cx="12" cy="12" r="2.6"/>' +
    '<path d="M4.5 19.5 19.5 4.5"/></g>',
);
/** TWO ARROWS ROUND A CARD — turn over. */
const FLIP_ICON = svg(
  24,
  24,
  '<g fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="8.5" y="5" width="7" height="14" rx="1.4"/>' +
    '<path d="M5 9V6.5h2.5"/><path d="M5 6.5 7.4 8.9"/>' +
    '<path d="M19 15v2.5h-2.5"/><path d="M19 17.5 16.6 15.1"/></g>',
);
/** A PIN. */
const PIN_ICON = svg(
  24,
  24,
  '<g fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M9 4h6"/><path d="M10 4v5l-3 3v1.5h10V12l-3-3V4"/><path d="M12 13.5V20"/></g>',
);

const ICONS: Record<BarWhat, { readonly asset: string; readonly src: string }> = {
  lock: { asset: "seat.bar.lock", src: LOCK_ICON },
  hide: { asset: "seat.bar.hide", src: HIDE_ICON },
  flip: { asset: "seat.bar.flip", src: FLIP_ICON },
  pin: { asset: "seat.bar.pin", src: PIN_ICON },
};

/** Register what the bar's nodes point at by name. Idempotent — a re-render calls it again. */
export function installBarArt(): void {
  registerSurface(BAR_PLATE, {
    layers: [{ paint: "panelBg", opacity: 0.78 }],
    radius: BAR.size / 2,
    stroke: { color: "panelBorder", width: 0.012, alignment: 1, opacity: 0.8 },
  });
  for (const what of BAR_WHATS) registerAsset(ICONS[what].asset, { src: ICONS[what].src, w: BAR.size, h: BAR.size });
}

/**
 * THE FOUR CONTROLS FOR ONE HAND, built and not yet placed — `fitBar` puts them along a rim.
 *
 * Only for a chair that is a HAND: a board's place has no cards to shut, hide or turn, and a pin on
 * a place that already refuses every other finger would be a control that does nothing. And only
 * for a held one — a place nobody holds has nobody to press.
 */
export function seatBar(seat: string, chair: Node, ink: Paint): Node[] {
  if (!isChair(chair) || !isHand(chair)) return [];
  installBarArt();
  const step = BAR.size + BAR.gap;
  const from = -(step * (BAR_WHATS.length - 1)) / 2;
  // THE BAR'S ORIGIN IS ITS NEAR EDGE, not its middle: it is held on the glass (`Screened`) and
  // scales about its origin, so a bar seated by its middle grew back over the rim it was a gap
  // away from whenever the view zoomed out. Seated by its near edge, it grows away from the box
  // at every zoom — the controls stand at `-size/2`, wholly on the far side.
  //
  // ...AND IT LIES AS THE CHAIR LIES — not a billboard: a bar stood upright to every viewer stood
  // over the box for the player opposite, whose "past the far rim" is down their glass. Only the
  // GLYPHS stand up (`upright`): a padlock read upside down is a padlock read wrong, and the plate
  // is a circle that does not care.
  const bar = node(
    chairBarId(seat),
    Transformable({ at: { x: 0, y: 0 } }),
    // SIZED FOR THE FINGER, not the desk: the same pixels at every zoom.
    Screened({ screened: true }),
    // WHOSE INK LIGHTS A CONTROL THAT IS ON — the seat's own, kept on the bar for `dressBar`.
    Valued({ values: { [BAR_INK]: ink } }),
  );
  BAR_WHATS.forEach((what, i) => {
    add(
      bar,
      button(chairButtonId(seat, what), {
        bounds: circle(BAR.size / 2),
        surface: BAR_PLATE,
        icon: ICONS[what].asset,
        iconSize: BAR.size * 0.6,
        upright: true,
        means: { [BAR_VALUE]: what, [BAR_SEAT]: seat },
        at: { x: from + step * i, y: -BAR.size / 2 },
      }),
    );
  });
  return [bar];
}

/**
 * WHAT A PRESSED CONTROL MEANS — which of the four, and whose hand — or nothing for a control that
 * is not the bar's. Read off `Valued`, never off an id.
 */
export function barPress(control: Node): { readonly seat: string; readonly what: BarWhat } | undefined {
  const values = fieldsOf<ValuedFields>(control, "Valued")?.values;
  const what = values?.[BAR_VALUE];
  const seat = values?.[BAR_SEAT];
  if (typeof what !== "string" || typeof seat !== "string") return undefined;
  return BAR_WHATS.includes(what as BarWhat) ? { seat, what: what as BarWhat } : undefined;
}

/**
 * PUT THE ROW ALONG A RIM — its near edge a gap past `reach` from `at` in the direction of the
 * look (`facing`, the chair's own), turned with the chair so the row lies along its top edge.
 */
export function fitBar(desk: Node, seat: string, at: { readonly x: number; readonly y: number }, facing: number, reach: number): void {
  const bar = byId(desk, chairBarId(seat));
  if (!bar) return;
  const rad = (facing * Math.PI) / 180;
  const look = { x: -Math.sin(rad), y: -Math.cos(rad) };
  const out = reach + BAR.gap;
  const own = fieldsOf<TransformableFields>(bar, "Transformable");
  compose(bar, Transformable({ ...(own ?? {}), at: { x: at.x + look.x * out, y: at.y + look.y * out }, angle: -facing }));
}

/**
 * THE STATES, SHOWN ON THE CONTROLS — lit while on, plain while off, read off the CHAIR so every
 * copy of the bar lights the same controls. The flip has nothing to read and is never lit.
 *
 * `where` is the tree the controls stand in and `chair` the one the states are read from, because
 * they are not always the same tree: the bar on the glass (`handHud`) hangs on the screen root while
 * the hand it belongs to stands on the felt. Told only a desk, it finds the chair in it, which is
 * every caller on the table side.
 */
export function dressBar(where: Node, seat: string, chair: Node | undefined = byId(where, chairId(seat))): void {
  if (!chair) return;
  const desk = where;
  const on: Record<BarWhat, boolean> = {
    lock: handLocked(chair),
    hide: handHidden(chair),
    flip: false,
    pin: chairPinned(chair),
  };
  const bar = byId(desk, chairBarId(seat));
  const ink = bar ? fieldsOf<ValuedFields>(bar, "Valued")?.values[BAR_INK] : undefined;
  // LIT IN THE OWNER'S INK — a status the whole table reads, not the press's own dim wash.
  const lit: Coat = typeof ink === "string" ? { recipe: "wash", level: LIT_WASH, tint: ink } : HELD;
  for (const what of BAR_WHATS) {
    const control = byId(desk, chairButtonId(seat, what));
    if (!control) continue;
    if (on[what]) compose(control, Coated({ self: NO_COAT, cast: lit }));
    else decompose(control, "Coated");
  }
}
