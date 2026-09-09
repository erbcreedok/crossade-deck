// THE RIGHTS OF A PLACE — the marks beside a chair that say what is true of it, and the controls
// on the owner's own glass that change it.
//
// A hand has three things its owner may say about it and one about the chair it is in: SHUT it
// (nobody else reaches in — the lock), HIDE it (everybody else sees backs), TURN IT OVER (every
// card in place, order untouched) and PIN the chair (nobody moves it, its owner included). And a
// hand LIES somehow — three toggles, fan · shrink · tuck, each on or off by itself (`handZone.ts`).
//
// THE SEAT DESIGN SPLITS THEM IN TWO. On the FELT a place wears MARKS: a column of small badges on
// the owner's left — a pin, a padlock, a struck eye — one for every state that is on and none for
// one that is off, so the whole table reads WHY a card will not come out before anybody reaches for
// it. Nobody presses a mark. The CONTROLS stand on the owner's own HUD, on ONE OPAQUE BAR across the
// foot of the glass — the owner's stand for it (`design/hud`): the rights on the left, the flip and
// the three toggles on the right, one row. The cards of the hand stand above the bar and are drawn
// UNDER it, tucked under its edge like under a spine. Everybody sees the marks; only the owner has
// the controls, because only the owner's screen carries them.
//
// EVERY CONTROL CARRIES ITS MEANING (`Valued`: which control, whose hand) — the press is the kit's
// (`wireButtons`) and reports every press on the glass; what it MEANS is read off the control and
// answered by the people wiring for the seat that owns it (`Avatars.pressed`). A control that is ON
// is the design's gold button; one that is off is the dark plate. Both are one node rebuilt, never
// a coat over a plate that stays.

import {
  add,
  Bounded,
  button,
  byId,
  compose,
  fieldsOf,
  node,
  NO_COAT,
  Oriented,
  Pressable,
  rect,
  registerAsset,
  registerSurface,
  roundedRect,
  remove,
  Surfaced,
  Transformable,
  Valued,
  svg,
  type Node,
  type Paint,
  type TransformableFields,
  type ValuedFields,
} from "game-kit";
import { chairId, chairPinned, isChair, SEAT_LOOK } from "./seatPlace.js";
import { HAND_FOLDS, handHidden, handLocked, handPose, isHand, type HandFold } from "./handZone.js";

/** What a control is for — the three rights, the flip, and the three toggles of the pose. */
export type BarWhat = "pin" | "lock" | "hide" | "flip" | HandFold;
/** The rights, in the order they stand — on the chair as marks and on the HUD as controls. */
export const BAR_RIGHTS: readonly BarWhat[] = ["pin", "lock", "hide"];
/** The flip and the toggles, in the order they stand on the HUD — the stand's right group. */
export const BAR_POSES: readonly BarWhat[] = ["flip", ...HAND_FOLDS];
export const BAR_WHATS: readonly BarWhat[] = [...BAR_RIGHTS, ...BAR_POSES];
/** The two groups a bar is, and which controls stand in each. */
export type BarGroup = "rights" | "poses";
export const BAR_GROUPS: Readonly<Record<BarGroup, readonly BarWhat[]>> = { rights: BAR_RIGHTS, poses: BAR_POSES };

/** The states a mark can say — the ones that are on or off; a flip is an act and has no mark. */
const MARKED: readonly BarWhat[] = ["pin", "lock", "hide"];

/**
 * THE BAR'S MEASURE, in HUD units — the stand's numbers over its 74px card: a 44px button, a 6px
 * gap, 16px in from the edges, 8px of bar round the buttons, a 3px keyline and an 8px corner; the
 * cards tucked 18px under the bar's edge, and 75px of shade behind them, dense at the bar — half
 * the stand's: the owner wanted the reach of the foot half as tall.
 */
export const BAR = { size: 0.6, gap: 0.08, margin: 0.22, pad: 0.11, radius: 0.11, line: 0.04, tuck: 0.24, fade: 1, shade: 0.85 };

/** How tall the bar is, in HUD units — the buttons and the bar round them. */
export function barHeight(): number {
  return BAR.size + 2 * BAR.pad;
}

/**
 * A MARK'S MEASURE, in units of the felt — the design's 20px badge beside its 74px arch, in a
 * column 22px apart, its centre 50px to the owner's left of the arch's centre.
 */
export const MARK = { size: 0.6, step: 0.65, x: -1.49, line: 0.06 };

/** The key a control's meaning is written under — read by `barPress`, never parsed out of an id. */
const BAR_VALUE = "bar";
const BAR_SEAT = "barSeat";
/** Whether the control was last built lit — so a re-dressing rebuilds only what changed. */
const BAR_LIT = "barLit";

/** The design's own button colours — content, like the chair's wood (`SEAT_LOOK`). */
const BAR_LOOK = {
  plateHi: "#25321f",
  plateLo: "#16210f",
  rim: "#6b4d2c",
  goldHi: "#f8d885",
  goldLo: "#b08a26",
  glyph: "white",
} as const;

const PLATE_OFF = "desk.bar.off";
const FACE_OFF = "desk.bar.off.face";
const PLATE_ON = "desk.bar.on";
const MARK_PLATE = "desk.seat.mark";
/** The bar itself — opaque wood with the keyline, drawn over the cards. */
export const BAR_PLATE = "desk.bar.plate";
/** The shade behind the cards — from the bar up, dense at the bar, nothing at the top. */
export const BAR_FADE = "desk.bar.fade";

/** The id a control answers to. Built here, never parsed (`guard.id-is-opaque`). */
export function chairButtonId(seat: string, what: BarWhat): string {
  return `${chairBarId(seat)} ${what}`;
}

/** THE ID OF THE BAR ITSELF — one node holding both groups. */
export function chairBarId(seat: string): string {
  return `${chairId(seat)} bar`;
}

/** The id of one group of the bar — the rights, or the folds. */
export function chairBarGroupId(seat: string, group: BarGroup): string {
  return `${chairBarId(seat)} ${group}`;
}

/** The id of one mark beside a chair. */
export function chairMarkId(seat: string, what: BarWhat): string {
  return `${chairId(seat)} mark ${what}`;
}

/** THE GLYPHS — the design's own strokes for the rights; the flip and the folds drawn as CARDS (the stand's). */
const GLYPHS: Readonly<Record<BarWhat, string>> = {
  pin: '<path d="M9 3h6l-1 6h2l1 5H7l1-5h2L9 3z"/><path d="M12 14v7"/>',
  lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3"/><path d="M5 11h14v10H5z"/>',
  hide: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9 9 0 0 1 22 12s-1.5 2.6-4.3 4.5"/><path d="M6.4 7.6C3.9 9.3 2 12 2 12s4 7 10 7c1.5 0 2.9-.3 4.1-.9"/>',
  // A CARD AND TWO ARCS ROUND IT — turn over.
  flip: '<rect x="7.5" y="4" width="9" height="16" rx="1.5"/><path d="M4 9.5A9 9 0 0 1 8.2 4.4"/><path d="M8.6 2.2 8.2 4.4l2.2.5"/><path d="M20 14.5A9 9 0 0 1 15.8 19.6"/><path d="M15.4 21.8l.4-2.2-2.2-.5"/>',
  // THREE CARDS OUT OF ONE POINT — every one of them showing.
  fan: '<rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(-28 12 20)"/><rect x="9" y="5" width="6" height="12" rx="1"/><rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(28 12 20)"/>',
  // A CARD AND ARROWS INTO IT — closed up.
  shrink: '<rect x="8" y="5" width="8" height="14" rx="1"/><path d="M2 12h4"/><path d="M4 9.5 6.5 12 4 14.5"/><path d="M22 12h-4"/><path d="M20 9.5 17.5 12l2.5 2.5"/>',
  // A CARD GOING DOWN UNDER THE BAR — put away.
  tuck: '<path d="M12 2v6"/><path d="M9.5 5.5 12 8l2.5-2.5"/><rect x="8" y="9.5" width="8" height="8" rx="1"/><path d="M3 15h18v5H3z"/>',
};

/** A glyph as a picture, in one colour — the dark plate wants a light one, the gold plate a dark one. */
function glyph(what: BarWhat, ink: string): string {
  return svg(
    24,
    24,
    `<g fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[what]}</g>`,
  );
}

function glyphAsset(what: BarWhat, lit: boolean): string {
  return `desk.bar.${what}.${lit ? "on" : "off"}`;
}
function markAsset(what: BarWhat): string {
  return `desk.seat.mark.${what}`;
}

/** Register what the bar's and the marks' nodes point at by name. Idempotent — a re-render calls it again. */
export function installBarArt(): void {
  registerSurface(PLATE_OFF, {
    layers: [{ gradient: { stops: [{ at: 0, paint: BAR_LOOK.plateHi }, { at: 1, paint: BAR_LOOK.plateLo }], angle: 90 } }],
    radius: BAR.radius,
    stroke: { color: SEAT_LOOK.black, width: BAR.line, alignment: 1 },
  });
  registerSurface(FACE_OFF, {
    layers: [],
    radius: Math.max(0, BAR.radius - BAR.line),
    stroke: { color: BAR_LOOK.rim, width: BAR.line * 0.7, alignment: 1 },
  });
  registerSurface(PLATE_ON, {
    layers: [{ gradient: { stops: [{ at: 0, paint: BAR_LOOK.goldHi }, { at: 0.48, paint: SEAT_LOOK.gold }, { at: 1, paint: BAR_LOOK.goldLo }], angle: 90 } }],
    radius: BAR.radius,
    stroke: { color: SEAT_LOOK.black, width: BAR.line, alignment: 1 },
  });
  registerSurface(BAR_PLATE, {
    layers: [{ gradient: { stops: [{ at: 0, paint: BAR_LOOK.rim }, { at: 0.02, paint: SEAT_LOOK.black }, { at: 0.06, paint: BAR_LOOK.rim }, { at: 0.1, paint: "#3a2a1d" }, { at: 1, paint: "#2a1d13" }], angle: 90 } }],
  });
  registerSurface(BAR_FADE, {
    layers: [{ gradient: { stops: [{ at: 0, paint: `rgba(11,7,4,0)` }, { at: 1, paint: `rgba(11,7,4,${BAR.shade})` }], angle: 90 } }],
  });
  registerSurface(MARK_PLATE, {
    layers: [{ paint: SEAT_LOOK.black }],
    stroke: { color: SEAT_LOOK.gold, width: MARK.line, alignment: 1 },
  });
  for (const what of BAR_WHATS) {
    registerAsset(glyphAsset(what, false), { src: glyph(what, BAR_LOOK.glyph), w: BAR.size, h: BAR.size });
    registerAsset(glyphAsset(what, true), { src: glyph(what, SEAT_LOOK.black), w: BAR.size, h: BAR.size });
  }
  for (const what of MARKED) // A LITERAL, never a token: the glyph is a picture of its own, and a token written into it
    // resolves against nothing — the mark came out as an empty square.
    registerAsset(markAsset(what), { src: glyph(what, SEAT_LOOK.gold), w: MARK.size, h: MARK.size });
  registerSurface(markFace(), { layers: [] });
}

function markFace(): string {
  return "desk.seat.mark.face";
}

/** One control, built lit or plain — the whole look in one place, so a re-dressing rebuilds and never patches. */
function control(seat: string, what: BarWhat, lit: boolean, at: { readonly x: number; readonly y: number }): Node {
  return button(chairButtonId(seat, what), {
    bounds: roundedRect(BAR.size, BAR.size, BAR.radius),
    surface: lit ? PLATE_ON : PLATE_OFF,
    face: lit ? "" : FACE_OFF,
    inset: BAR.line,
    icon: glyphAsset(what, lit),
    iconSize: BAR.size * 0.55,
    upright: true,
    means: { [BAR_VALUE]: what, [BAR_SEAT]: seat, [BAR_LIT]: lit ? 1 : 0 },
    at,
  });
}

/**
 * Where a control stands in its group — one row each, on the bar: the rights from the group's
 * left edge, the flip and the folds from the group's right edge. A group's origin is its outer
 * edge on the bar's midline, so the two are placed by the corners of the glass.
 */
function seatOf(group: BarGroup, i: number): { readonly x: number; readonly y: number } {
  const step = BAR.size + BAR.gap;
  if (group === "rights") return { x: BAR.size / 2 + step * i, y: 0 };
  const n = BAR_GROUPS[group].length;
  return { x: -(BAR.size / 2 + step * (n - 1 - i)), y: 0 };
}

/**
 * THE BAR FOR ONE HAND — the opaque plate and its two groups, built and not yet placed: `fitBar`
 * lays it across the foot of a glass.
 *
 * Only for a chair that is a HAND: a board's place has no cards to shut, hide or turn, and a pin on
 * a place that already refuses every other finger would be a control that does nothing. And only
 * for a held one — a place nobody holds has nobody to press.
 */
export function seatBar(seat: string, chair: Node, _ink: Paint): Node[] {
  if (!isChair(chair) || !isHand(chair)) return [];
  installBarArt();
  // THE PLATE ANSWERS THE FINGER AND WEARS NOTHING FOR IT: the foot of the glass is the owner's
  // furniture, a finger that lands between two buttons is on the bar and not on the felt under it —
  // so it says so (`Pressable`), and the camera that asks the screen who wants the finger stands
  // down. A press on it means nothing (`barPress` reads no control off it), which is the point.
  const bar = node(
    chairBarId(seat),
    Bounded({ bounds: rect(1, barHeight()) }),
    Surfaced({ surface: BAR_PLATE }),
    Pressable({ hover: NO_COAT, held: NO_COAT, sink: 0, nudge: { x: 0, y: 0 } }),
    Transformable({ at: { x: 0, y: 0 } }),
  );
  for (const group of ["rights", "poses"] as const) {
    const holder = node(chairBarGroupId(seat, group), Transformable({ at: { x: 0, y: 0 } }));
    BAR_GROUPS[group].forEach((what, i) => add(holder, control(seat, what, false, seatOf(group, i))));
    add(bar, holder);
  }
  return [bar];
}

/**
 * WHAT A PRESSED CONTROL MEANS — which of the eight, and whose hand — or nothing for a control that
 * is not the bar's. Read off `Valued`, never off an id.
 */
export function barPress(control: Node): { readonly seat: string; readonly what: BarWhat } | undefined {
  const values = fieldsOf<ValuedFields>(control, "Valued")?.values;
  const what = values?.[BAR_VALUE];
  const seat = values?.[BAR_SEAT];
  if (typeof what !== "string" || typeof seat !== "string") return undefined;
  return BAR_WHATS.includes(what as BarWhat) ? { seat, what: what as BarWhat } : undefined;
}

/** How wide a group is, in HUD units. */
export function barExtent(group: BarGroup): { readonly w: number; readonly h: number } {
  const step = BAR.size + BAR.gap;
  const n = BAR_GROUPS[group].length;
  return { w: BAR.size + step * (n - 1), h: BAR.size };
}

/**
 * LAY THE BAR ACROSS THE FOOT OF A GLASS — the plate as wide as the glass, standing on the
 * device's own inset (`inset`, HUD units), the rights `BAR.margin` in from its left edge and the
 * flip and the folds the same in from its right, in the frame whose origin is the glass's middle.
 */
export function fitBar(where: Node, seat: string, glass: { readonly w: number; readonly h: number }, inset = 0): void {
  const bar = byId(where, chairBarId(seat));
  if (!bar) return;
  const h = barHeight();
  compose(bar, Bounded({ bounds: rect(Math.max(1, glass.w), h) }));
  compose(bar, Transformable({ ...(fieldsOf<TransformableFields>(bar, "Transformable") ?? {}), at: { x: 0, y: glass.h / 2 - inset - h / 2 } }));
  const rights = byId(bar, chairBarGroupId(seat, "rights"));
  const poses = byId(bar, chairBarGroupId(seat, "poses"));
  // SEVEN CONTROLS HAVE TO FIT THE GLASS. A glass narrower than the row — a phone whose HUD unit
  // runs bigger than the stand's card — shrinks both groups alike, about their outer edges, rather
  // than letting the two rows run into each other in the middle.
  const need = barExtent("rights").w + barExtent("poses").w + 2 * BAR.margin + BAR.gap;
  const scale = glass.w > 0 && need > glass.w ? Math.max(0.5, glass.w / need) : 1;
  if (rights) compose(rights, Transformable({ ...(fieldsOf<TransformableFields>(rights, "Transformable") ?? {}), at: { x: -glass.w / 2 + BAR.margin * scale, y: 0 }, scale }));
  if (poses) compose(poses, Transformable({ ...(fieldsOf<TransformableFields>(poses, "Transformable") ?? {}), at: { x: glass.w / 2 - BAR.margin * scale, y: 0 }, scale }));
}

/**
 * THE STATES, SHOWN ON THE CONTROLS — gold while on, the dark plate while off, read off the CHAIR
 * so every copy of the bar lights the same controls. A flip has nothing to read and is never lit;
 * each toggle of the pose lights its own control, so a fanned and shrunk hand lights two.
 *
 * `where` is the tree the controls stand in and `chair` the one the states are read from, because
 * they are not always the same tree: the bar on the glass hangs on the screen root while the hand it
 * belongs to stands on the felt. Told only a desk, it finds the chair in it.
 */
export function dressBar(where: Node, seat: string, chair: Node | undefined = byId(where, chairId(seat))): void {
  if (!chair) return;
  const pose = handPose(chair);
  const on: Record<BarWhat, boolean> = {
    pin: chairPinned(chair),
    lock: handLocked(chair),
    hide: handHidden(chair),
    flip: false,
    ...pose,
  };
  for (const group of ["rights", "poses"] as const) {
    const holder = byId(where, chairBarGroupId(seat, group));
    if (!holder) continue;
    BAR_GROUPS[group].forEach((what, i) => {
      const standing = byId(holder, chairButtonId(seat, what));
      const was = standing ? fieldsOf<ValuedFields>(standing, "Valued")?.values[BAR_LIT] === 1 : undefined;
      if (was === on[what]) return;
      const index = standing ? holder.children.indexOf(standing) : holder.children.length;
      if (standing) remove(holder, standing);
      const made = control(seat, what, on[what], seatOf(group, i));
      add(holder, made);
      const kids = holder.children;
      kids.splice(index, 0, ...kids.splice(kids.length - 1, 1));
    });
  }
}

/**
 * THE MARKS BESIDE A CHAIR — one per state that is ON, in a column on the owner's left, and none
 * for a state that is off: absence is the refusal (CANONS §1). Made and taken down HERE, in the
 * chair's own layer, and placed by `fitMarks`.
 */
export function dressMarks(desk: Node, seat: string): void {
  const chair = byId(desk, chairId(seat));
  const layer = chair?.parent;
  if (!chair || !layer || !isHand(chair)) return;
  installBarArt();
  const on: Partial<Record<BarWhat, boolean>> = { pin: chairPinned(chair), lock: handLocked(chair), hide: handHidden(chair) };
  for (const what of MARKED) {
    const standing = byId(layer, chairMarkId(seat, what));
    if (on[what] && !standing) {
      const made = node(chairMarkId(seat, what), Bounded({ bounds: rect(MARK.size, MARK.size) }), Surfaced({ surface: MARK_PLATE }), Transformable({ at: { x: 0, y: 0 } }));
      // THE GLYPH STANDS UP to whoever is looking: a padlock read upside down is a padlock read wrong.
      add(
        made,
        node(
          `${chairMarkId(seat, what)} glyph`,
          Bounded({ bounds: rect(MARK.size * 0.65, MARK.size * 0.65) }),
          Surfaced({ surface: markGlyph(what) }),
          Transformable({ at: { x: 0, y: 0 } }),
          Oriented({ orientation: "viewer" }),
        ),
      );
      add(layer, made);
    } else if (!on[what] && standing) {
      remove(layer, standing);
    }
  }
  const pose = fieldsOf<TransformableFields>(chair, "Transformable");
  fitMarks(desk, seat, pose?.at ?? { x: 0, y: 0 }, pose?.angle ?? 0);
}

function markGlyph(what: BarWhat): string {
  const name = `desk.seat.mark.${what}.face`;
  registerSurface(name, { layers: [{ image: markAsset(what), fit: "contain" }] });
  return name;
}

/** The marks that are up for this chair, in the order they stand. */
export function chairMarks(desk: Node, seat: string): Node[] {
  return MARKED.map((what) => byId(desk, chairMarkId(seat, what))).filter((n): n is Node => n !== undefined);
}

/**
 * PUT THE COLUMN BESIDE THE CHAIR — on the owner's left, centred on the arch's middle, in the
 * chair's own frame: turned with it, so "left" is the owner's left whichever way the place looks.
 */
export function fitMarks(desk: Node, seat: string, at: { readonly x: number; readonly y: number }, angle: number): void {
  const up = chairMarks(desk, seat);
  const rad = (angle * Math.PI) / 180;
  up.forEach((markNode, k) => {
    const local = { x: MARK.x, y: (k - (up.length - 1) / 2) * MARK.step };
    const turned = { x: local.x * Math.cos(rad) - local.y * Math.sin(rad), y: local.x * Math.sin(rad) + local.y * Math.cos(rad) };
    const own = fieldsOf<TransformableFields>(markNode, "Transformable");
    compose(markNode, Transformable({ ...(own ?? {}), at: { x: at.x + turned.x, y: at.y + turned.y }, angle }));
  });
}
