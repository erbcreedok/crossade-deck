// THE REST OF THE INTERFACE — the pieces a game needs beside a button, each one literal data
// assembled into an element, the same bargain `pile()` and `button()` strike.
//
// None of them is a new ATOM. A label is `Bounded` + `Labeled`; a badge is that with a surface; a
// toggle is a button that stays pressed; a panel is a container that carries a title. Every one is
// a composition of what already exists, which is why there is no new capability to learn, no new
// rung on the ladder and nothing new for the renderer to know about.

import { add, compose, node, type Node } from "../core/node.js";
import { Bounded, extentOf, type Shape } from "../core/atoms/bounded.js";
import { Container, contentExtent } from "../core/atoms/container.js";
import { Labeled } from "../core/atoms/labeled.js";
import { ShadowCaster } from "../core/atoms/shadow.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { Valued } from "../core/atoms/valued.js";
import { type Vec } from "../core/transform.js";
import { type Atom } from "../core/atom.js";
import { button, type ButtonSpec } from "./button.js";
import { CONTROL_BAR, CONTROL_H, CONTROL_LABEL, CONTROL_W, lookSurface, skinSurface } from "./controls.js";
import { rect, roundedRect } from "./shapes.js";

// ---- label ------------------------------------------------------------------------------------

export interface LabelSpec {
  /** The words, ALREADY WRITTEN in the reader's language — the kit knows no localization. */
  readonly text: string;
  /** A registered text style's NAME. Absent, the stock control role. */
  readonly style?: string;
  readonly at?: Vec;
  /** The box the words are laid out in. Absent, a comfortable line. Words too long SHRINK to fit. */
  readonly bounds?: Shape;
}

/**
 * Words on the desk, and nothing else — no plate, no border, no press.
 *
 * The most common thing in any interface and the one most often built by accident out of a button
 * with its background switched off. A caption is not a control that declines to act; it is a
 * different thing, and it says so by carrying no `Pressable` at all.
 */
export function label(id: string, spec: LabelSpec): Node {
  const atoms: Atom[] = [
    Bounded({ bounds: spec.bounds ?? rect(CONTROL_W * 1.6, CONTROL_H) }),
    Labeled({ label: spec.text, style: spec.style ?? CONTROL_LABEL }),
  ];
  if (spec.at) atoms.push(Transformable({ at: spec.at }));
  return node(id, ...atoms);
}

// ---- badge ------------------------------------------------------------------------------------

export interface BadgeSpec {
  /** What it says — a count, a state, a suit. Already written. */
  readonly text: string;
  readonly at?: Vec;
  /** Which look, by registry name. Absent, `primary` — a badge is meant to be noticed. */
  readonly look?: string;
  /** How wide, in units. Absent, it is round-ended and about as wide as it is tall. */
  readonly width?: number;
  readonly style?: string;
}

/** The stock badge height — deliberately smaller than a control: it is read, never pressed. */
export const BADGE_H = 0.22;

/**
 * A small plate with a number or a word on it: a count, a score, a turn marker.
 *
 * Round-ended by default, because a badge holding "1" and one holding "128" should look like the
 * same object at two widths rather than like two different objects.
 */
export function badge(id: string, spec: BadgeSpec): Node {
  const w = spec.width ?? BADGE_H * 1.6;
  const atoms: Atom[] = [
    Bounded({ bounds: roundedRect(w, BADGE_H, BADGE_H / 2) }),
    Surfaced({ surface: lookSurface(spec.look ?? "primary") }),
    Labeled({ label: spec.text, style: spec.style ?? CONTROL_LABEL }),
  ];
  if (spec.at) atoms.push(Transformable({ at: spec.at }));
  return node(id, ...atoms);
}

// ---- toggle -----------------------------------------------------------------------------------

export interface ToggleSpec extends ButtonSpec {
  /** Whether it is ON right now. The consumer keeps this — the tree never holds a second copy. */
  readonly on: boolean;
}

/**
 * A control that stays pressed.
 *
 * It is a `button()` and not a new preset, because that is exactly what it is: the only difference
 * between "being pressed" and "on" is how long it lasts. WHICH toggles are on is the game's state
 * and is never stored here — the consumer rebuilds the node with the other `on` and the tree cannot
 * disagree with itself.
 */
export function toggle(id: string, spec: ToggleSpec): Node {
  const { on, ...rest } = spec;
  return button(id, { look: on ? "primary" : "quiet", ...rest, toggled: on });
}

/**
 * A row of toggles of which exactly ONE is on — a segmented control.
 *
 * `chosen` is the value that is on, compared against each option's own value. The row is data in,
 * nodes out: adding a fourth option is a fourth entry, never a fourth branch.
 */
export function toggles(
  id: string,
  spec: {
    readonly options: readonly { readonly value: string; readonly label: string }[];
    readonly chosen: string;
    readonly layout: string;
    /** What key the press reports the chosen value under. Absent, `picked`. */
    readonly key?: string;
    readonly at?: Vec;
  },
): Node {
  const row = node(id, Container({ layout: spec.layout }), ...(spec.at ? [Transformable({ at: spec.at })] : []));
  for (const option of spec.options) {
    add(
      row,
      toggle(`${id}/${option.value}`, {
        on: option.value === spec.chosen,
        label: option.label,
        means: { [spec.key ?? "picked"]: option.value },
      }),
    );
  }
  return sized(row);
}

/**
 * GIVE A ROW ITS OWN BOX, measured from what it holds.
 *
 * A container with no `Bounded` occupies nothing — which is right for a group nobody arranges, and
 * wrong the moment its OWNER has a layout: a column measures each child's footprint to know where
 * the next one starts, so a row reporting no height stacks on top of the row before it. That is
 * exactly what a pause dialog looked like when this was missing — a heading, and everything else
 * piled into one line under it.
 */
export function sized(row: Node): Node {
  const { w, h } = contentExtent(row);
  return w > 0 && h > 0 ? compose(row, Bounded({ bounds: rect(w, h) })) : row;
}

// ---- hud --------------------------------------------------------------------------------------

/** The box a bar is seated against — a play area, in units. What `extentOf` hands back. */
export interface Area {
  readonly w: number;
  readonly h: number;
}

/** How far a bar stands off the edge it is seated against, in units. */
export const HUD_MARGIN = 0.18;

/**
 * WHERE A BAR SITS, given the area it belongs to — the arithmetic every game was doing by hand.
 *
 * Two functions rather than one with a side to read, because "which edge" is not a value anything
 * should branch on: a caller that knows it wants the bottom says so by CALLING it. That also keeps
 * the answer honest under a changing area — a phone turned on its side re-asks and gets the new
 * number, instead of carrying a constant that was right for the old screen.
 */
export const topOf = (area: Area, height = CONTROL_H): Vec => ({ x: 0, y: -(area.h / 2 - height / 2 - HUD_MARGIN) });

/**
 * The other edge — and on a phone this is the one that matters: held upright, the top of the screen
 * is the one place a thumb cannot reach, so a bar of controls belongs along the bottom.
 */
export const bottomOf = (area: Area, height = CONTROL_H): Vec => ({ x: 0, y: area.h / 2 - height / 2 - HUD_MARGIN });

export interface HudSpec {
  /** The controls, in the order they stand. Built by the caller — a bar invents no buttons. */
  readonly controls: readonly Node[];
  /** Where the row sits, in the owner's units. `topOf(area)` and `bottomOf(area)` answer this. */
  readonly at: Vec;
  /** The arrangement, by registry name. Absent, the stock control bar. */
  readonly layout?: string;
  /** A plate behind the whole row, by registry name. Absent, the bar is only its controls. */
  readonly surface?: string;
}

/**
 * A BAR OF CONTROLS, seated — the piece every game grew its own copy of.
 *
 * It is a row with a box, and the box is the point: a container that reports no footprint stacks on
 * top of whatever its owner laid out before it, and a bar is exactly the thing an owner has to place
 * around. So the row is measured from what it holds (`sized`) rather than declared by the caller,
 * who would have to add up four control widths and three gaps to say it.
 *
 * REBUILT, NEVER MUTATED. Whether undo has anywhere to go is the game's state and the control is
 * drawn FROM it, so a bar is thrown away and made again whenever that state moves — which costs
 * nothing, and is the only way the tree cannot disagree with the game about what is possible.
 */
export function hud(id: string, spec: HudSpec): Node {
  const atoms: Atom[] = [Container({ layout: spec.layout ?? CONTROL_BAR }), Transformable({ at: spec.at })];
  if (spec.surface) atoms.push(Surfaced({ surface: spec.surface }));
  const bar = node(id, ...atoms);
  for (const control of spec.controls) add(bar, control);
  return sized(bar);
}

// ---- panel ------------------------------------------------------------------------------------

export interface PanelSpec {
  /** The box. Required — a panel with no footprint is not a panel, it is a layout. */
  readonly bounds: Shape;
  /** The heading, already written. Absent, the panel carries no title. */
  readonly title?: string;
  readonly titleStyle?: string;
  /** The arrangement of what it holds, by registry name. */
  readonly layout: string;
  /** The face, by registry name. Absent, a quiet panel. */
  readonly surface?: string;
  readonly at?: Vec;
  /** Whether it lays a shadow — a dialog over a table usually should. */
  readonly shadow?: "footprint" | "silhouette";
}

/**
 * A box with a heading and a shelf inside it: a pause dialog, a settings sheet, a score card.
 *
 * The title rides a node of its OWN rather than the panel's `Labeled`: a node's caption is drawn in
 * the middle of its area, and a heading belongs at the top. It is the FIRST child and carries no
 * pose of its own, so the panel's layout stacks it above everything else the same way it stacks the
 * rest — a heading that placed itself would fight whatever arrangement the panel was given.
 *
 * What the panel holds goes in with `add()`, arranged by its layout. The preset invents no slots.
 */
export function panel(id: string, spec: PanelSpec): Node {
  const atoms: Atom[] = [
    Bounded({ bounds: spec.bounds }),
    Surfaced({ surface: spec.surface ?? skinSurface({ fill: "panelBg", border: "panelBorder", radius: 0.08 }) }),
    Container({ layout: spec.layout }),
  ];
  if (spec.at) atoms.push(Transformable({ at: spec.at }));
  if (spec.shadow) atoms.push(ShadowCaster({ from: spec.shadow }));
  const box = node(id, ...atoms);
  if (spec.title !== undefined) {
    add(
      box,
      node(
        `${id}/title`,
        Bounded({ bounds: rect(extentOf(spec.bounds).w * 0.9, CONTROL_H) }),
        Labeled({ label: spec.title, style: spec.titleStyle ?? CONTROL_LABEL }),
      ),
    );
  }
  return box;
}

// ---- slider -----------------------------------------------------------------------------------

/**
 * WHERE THE KNOB SITS for a value, and WHAT VALUE a point means — the whole of a slider that can be
 * checked without a pointer, so it is here as arithmetic rather than inside a drag handler.
 */
export function knobAt(value: number, width: number): number {
  const t = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (t - 0.5) * width;
}

/** The value a point along the track means, clamped into 0…1. The exact inverse of `knobAt`. */
export function valueAt(x: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x / width + 0.5));
}

export interface SliderSpec {
  /** 0…1. The consumer's own state — the tree never keeps a second copy of it. */
  readonly value: number;
  /** How long the track is, in units. Absent, three controls wide. */
  readonly width?: number;
  readonly at?: Vec;
  /** What a drag on it reports under. Absent, `set`. */
  readonly key?: string;
}

/** The knob's size, in units — a finger's worth, and the track is thinner than it. */
export const KNOB = CONTROL_H * 0.8;

/**
 * A track and a knob. The knob is an ordinary control, so it hovers, sinks and reports like every
 * other one; what makes it a slider is that the consumer reads the pointer's place along the track
 * (`valueAt`) rather than the fact of a press.
 */
export function slider(id: string, spec: SliderSpec): Node {
  const width = spec.width ?? CONTROL_W * 3;
  const track = node(
    id,
    Bounded({ bounds: roundedRect(width, KNOB * 0.35, KNOB * 0.175) }),
    Surfaced({ surface: skinSurface({ fill: "sunkBg", border: "panelBorder", radius: KNOB * 0.175 }) }),
    Container({ layout: "free" }),
    Valued({ values: { [spec.key ?? "set"]: "track" } }),
    ...(spec.at ? [Transformable({ at: spec.at })] : []),
  );
  add(
    track,
    button(`${id}/knob`, {
      bounds: rect(KNOB, KNOB),
      skin: { fill: "accent", border: "", radius: KNOB / 2 },
      at: { x: knobAt(spec.value, width), y: 0 },
      means: { [spec.key ?? "set"]: "knob" },
    }),
  );
  return track;
}
