// THE STOCK CONTROLS — the looks a button already has, so that a button is ONE LINE.
//
// The preset before this one was a chassis: to get a control on screen you first registered a
// surface, then a text style, then a layout, then passed eight fields. That is homework, not a
// preset. A preset exists so the ready-made thing is ready.
//
//   installStockControls()
//   button("undo", { label: "Undo", means: { does: "undo" } })   // ← that is the whole of it
//
// FOUR LOOKS, BY NAME, because the kit reads no sorts: `look: "danger"` is not a tagged union, it
// is which registered record the control wears, and a fifth look is a `registerSurface` call in a
// game's own file — never a branch in here.
//
// The coats are named too. `wash` and `ring` are the renderer's vocabulary and a designer should
// not have to learn it to make a button glow: `HOVER`, `HELD` and `QUIET` are the answers, and a
// spec that wants its own passes its own.

import { registerSurface } from "../render/surfaces.js";
import { registerTextStyle } from "../render/textStyles.js";
import { registerLayout } from "../core/atoms/container.js";
import { rowLayout } from "../core/atoms/layouts.js";
import { type Coat } from "../core/atoms/coated.js";
import { type Paint } from "../core/paint.js";
import { type Shape } from "../core/atoms/bounded.js";
import { circle, rect, roundedRect } from "./shapes.js";

/** The four stock looks. A name, because that is what a field can hold and a designer can re-decide. */
export const CONTROL_LOOKS = ["primary", "quiet", "danger", "ghost", "outline", "sunk"] as const;
export type ControlLook = (typeof CONTROL_LOOKS)[number];

/** The surface a look is worth: `control/primary` and its three siblings. */
export const lookSurface = (look: string): string => `control/${look}`;
/**
 * The inner face of a look, when it has one — `control/<look>/face`.
 *
 * The stock looks have NONE: a fill that is covered by a face is not a fill, it is a ring, and that
 * is what every one of them drew before this. A game whose motif genuinely is a ring around a face
 * registers both records and names them itself.
 */
export const lookFace = (_look: string): string => "";

/** What the stock controls wear under a pointer and while held. Data, so a spec may replace either. */
export const HOVER: Coat = { recipe: "wash", level: 0.14, tint: "text" };
export const HELD: Coat = { recipe: "wash", level: 0.26, tint: "shadow" };
/** A control that is present but asleep — the greyed look, worn by the consumer that declines it. */
export const QUIET: Coat = { recipe: "wash", level: 0.45, tint: "stageBg" };

/**
 * THE STOCK CONTROL BOX, IN UNITS — and the units matter, because the first version was out by a
 * factor of three.
 *
 * A unit is what the WORLD measures in: a playing card is 1 × 1.4 of them. A control two units wide
 * was therefore twice the width of a card, which at any real etalon is a 350-pixel button. A control
 * is a small thing beside the things it acts on — about a card's width, a third of its height.
 */
export const CONTROL_W = 0.95;
export const CONTROL_H = 0.34;

/**
 * THE STOCK BOXES, as shapes rather than as a size word.
 *
 * A `size: "s" | "m" | "l"` would be a sort for the preset to read, and the kit reads none. These
 * are ordinary `Shape`s handed to `bounds`, so a game that wants a fourth size writes `rect(…)` and
 * owes nobody a new enum — and a control can be any shape at all, which is how an icon button and a
 * pill stop being special cases.
 */
export const SMALL = (): Shape => rect(0.7, 0.26);
export const MEDIUM = (): Shape => rect(CONTROL_W, CONTROL_H);
export const LARGE = (): Shape => rect(1.4, 0.46);
/** A pill: the radius is half the height, so the ends are semicircles at any width. */
export const PILL = (w = CONTROL_W, h = CONTROL_H): Shape => roundedRect(w, h, h / 2);
/** A square control — an icon on its own, with no room for words. */
export const SQUARE = (side = CONTROL_H): Shape => rect(side, side);
/** A round control — the same, for a look that wants no corners at all. */
export const ROUND = (r = CONTROL_H / 2): Shape => circle(r);
/** How far the face sits inside the plate — the ring the motif is built on. */
export const CONTROL_INSET = 0.02;

/** The stock arrangement for a row of controls, by name. A HUD bar is `Container({ layout: CONTROL_BAR })`. */
export const CONTROL_BAR = "control/bar";
/**
 * A look written OUT, rather than picked from four frozen ones.
 *
 * The named looks are shorthand for the common answers; this is the answer itself — a background or
 * none, a border or none, and how round the corners are. It registers the record it describes and
 * hands back the name, memoised by those very values, so writing the same skin twice costs one
 * entry. That keeps the kit's law intact (a look is a REGISTERED RECORD, always) while a designer
 * writes `{ fill: "accent", border: "", radius: 0.35 }` inline and never learns the registry.
 */
export interface Skin {
  /** Background token. `""` is NO background — a control that is only its border, or only its words. */
  readonly fill?: Paint;
  /** Border token. `""` is no border. */
  readonly border?: Paint;
  /** Border width in units. Absent, a hairline. */
  readonly borderWidth?: number;
  /** Corner radius in units. `0` is square corners; half the height is a pill. */
  readonly radius?: number;
}

export function skinSurface(skin: Skin): string {
  const fill = skin.fill ?? "";
  const border = skin.border ?? "";
  const width = skin.borderWidth ?? 0.015;
  const radius = skin.radius ?? 0.05;
  // The NAME IS THE VALUES, so the same skin asked for twice is the same entry — and a name a
  // reader sees in the inspector says what it is worth without a lookup.
  const name = `control/skin/${String(fill)}/${String(border)}/${width}/${radius}`;
  registerSurface(name, {
    layers: fill === "" ? [] : [{ paint: fill }],
    radius,
    ...(border === "" ? {} : { stroke: { color: border, width, alignment: 1 } }),
  });
  return name;
}

/**
 * The surface an icon is drawn with — one registered record per asset, made on demand.
 *
 * A picture reaches the glass through a SURFACE, and a surface is a registry entry; rather than
 * making every caller register one for every glyph, this makes it once per asset name and hands the
 * name back. `contain`, so an icon of any proportion fits its box and shows the mismatch as bars
 * rather than quietly cropping.
 */
export function iconSurface(asset: string): string {
  const name = `control/icon/${asset}`;
  registerSurface(name, { layers: [{ image: asset, fit: "contain" }] });
  return name;
}

/** The stock caption role. A ROLE, never a font — the theme answers what it is worth. */
export const CONTROL_LABEL = "control/label";
/** The caption role for words sitting ON a filled control, where the ordinary one would vanish. */
export const CONTROL_LABEL_ON = "control/label-on";

/** Which looks FILL their whole box — their words need the other role, and they carry no inner face. */
const FILLED = new Set(["primary", "danger"]);

/** The caption role a look asks for. Filled looks want dark words; the rest want the ordinary ones. */
export const lookLabel = (look: string): string => (FILLED.has(look) ? CONTROL_LABEL_ON : CONTROL_LABEL);

/** Does this look want an inner face at all? Only the ones whose motif is a ring around one. */
export const lookHasFace = (look: string): boolean => look === "" || false;

/**
 * Register everything a stock control is made of. Called by the consumer like every other
 * `installStock*`.
 *
 * NO "already done" LATCH, deliberately — the registries are maps, so registering twice overwrites
 * and costs nothing, while a latch turns the reset seam every suite uses into a trap: `resetSurfaces()`
 * empties the registry, the next `install` returns early because it "already ran", and every test
 * after the first one draws nothing at all. That is exactly how this file failed the day it landed.
 */
export function installStockControls(): void {
  // PRIMARY — SOLID. The accent fills the whole control and the words sit ON it. There is no inner
  // face, and that is the fix for the mistake this file shipped with: every look was a plate with a
  // face covering it, so the fill only ever showed as a ring, and a plain blue button — the most
  // ordinary control there is — could not be made at all.
  registerSurface(lookSurface("primary"), { layers: [{ paint: "accent" }], radius: 0.05 });

  // QUIET — the everyday control: a panel with a hairline, no accent spent on it.
  registerSurface(lookSurface("quiet"), {
    layers: [{ paint: "panelBg" }],
    radius: 0.05,
    stroke: { color: "panelBorder", width: 0.015, alignment: 1 },
  });

  // DANGER — the one that discards a game. Same assembly, one token different (`alert`, the
  // palette's own — inventing a `danger` token would be a second name for one job), which is the
  // whole argument for looks-as-records: nothing changes about the control except what it is worth.
  registerSurface(lookSurface("danger"), { layers: [{ paint: "alert" }], radius: 0.05 });

  // OUTLINE — the ring alone: a stroke and nothing behind it. The emphasis between a filled plate
  // and a bare caption, and the one every toolbar's secondary action wants.
  registerSurface(lookSurface("outline"), { layers: [], radius: 0.05, stroke: { color: "accent", width: 0.02, alignment: 1 } });


  // SUNK — pressed INTO the desk rather than standing on it: a darker well with a hairline. What a
  // toggle that is already on looks like, and what a segmented control's chosen segment wears.
  registerSurface(lookSurface("sunk"), { layers: [{ paint: "sunkBg" }], radius: 0.05, stroke: { color: "panelBorder", width: 0.015, alignment: 1 } });


  // GHOST — no plate at all: a caption that answers a finger. One node, and the hover coat is the
  // only thing that says it is a control, which is exactly what a toolbar's quiet actions want.
  registerSurface(lookSurface("ghost"), { layers: [] });

  registerTextStyle(CONTROL_LABEL, {
    family: "ui-sans-serif, system-ui, sans-serif",
    size: 0.13,
    weight: 600,
    lineHeight: 1.2,
    fill: "text",
  });
  // THE SECOND ROLE, for words that sit ON a filled control. `text` is light because the desk is
  // dark; on a bright accent it disappears. A role, not a colour written at a call site — which is
  // the whole reason roles exist.
  registerTextStyle(CONTROL_LABEL_ON, {
    family: "ui-sans-serif, system-ui, sans-serif",
    size: 0.13,
    weight: 600,
    lineHeight: 1.2,
    fill: "stageBg",
  });

  registerLayout(CONTROL_BAR, rowLayout({ gap: 0.09, padding: 0 }));
}
