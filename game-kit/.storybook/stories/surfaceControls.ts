// THE SHAPE AND THE RECORD, AS CONTROLS — shared by every section that shows either.
//
// It is here because the alternative was tried and failed: each scene declared the handful of
// arguments its own lesson needed, and the model quietly outgrew every one of them. `Bounded`
// has held `poly` since the day it was written and no section ever offered it; `Surfaced` grew
// a stroke with seven properties and one scene could reach four of them. A reader cannot tell
// "the kit cannot do this" from "the catalog did not ask", and that is the whole failure.
//
// So the controls are written ONCE, against what the type can actually hold, and a section
// takes the set whole. A scene that narrows them has to say so out loud, in one place.

// The record's VALUE half — see `record.ts` on why it is a module of its own.
export { ALIGNS, FITS, paintOf, recordOf, recordSource, RECORD_ARGS, type RecordArgs } from "./record.js";
import { ALIGNS, FITS, paintOf, recordOf, RECORD_ARGS, type RecordArgs } from "./record.js";
import {
  assetNames,
  installStockSurfaces,
  PALETTES,
  type DashPattern,
  type LineCap,
  type LineJoin,
  type Paint,
  type Point,
  type Shape,
  type SurfaceRecord,
} from "../../src/index.js";
import { installStockAssets } from "./stockAssets.js";
import { PRESETS, SHAPE_ARGS, shapeOf, type ShapeArgs } from "./shape.js";
import { currentSettings } from "../devtools/catalogSettings.js";
import { type CatalogText } from "../locales/catalog.js";

// THE REGISTRIES ARE FILLED BEFORE THEIR NAMES ARE READ.
//
// Every option list below is built when this module LOADS, and the stock records used to be
// installed by `scene()` — at the first render, which is later. So the surface picker was built
// from an empty registry and showed nothing at all: a control that looked like a decision
// somebody made rather than a bug.
//
// Installing here is not a workaround. A consumer installs the records it means to use, and the
// catalog is an ordinary consumer.
installStockSurfaces();
installStockAssets();


/** Every token the theme declares — the list follows the palette, it is not a copy of it. */
export const PAINTS = Object.keys(PALETTES.dark);

/**
 * What sort of value a control produces, READ OFF THE CONTROL rather than declared beside it.
 *
 * Sixty controls means sixty chances to write `number` next to a text box, and nobody would
 * ever notice: a wrong type in a table looks exactly like a right one. The control already
 * knows — a range is a number, a colour is a string — so it is asked instead of repeated.
 */
function typeOf(spec: Record<string, unknown>): string {
  const control = spec["control"] as { type?: string } | string | undefined;
  const kind = typeof control === "string" ? control : control?.type;
  if (kind === "number" || kind === "range") return "number";
  if (kind === "text" || kind === "color") return "string";
  // Named explicitly, or the fallback below calls a whole `Shape` a boolean — which is what the
  // `bounds` control said the day it arrived, in the one row where the type is the lesson.
  if (kind === "object") return "object";
  // A choice is worth naming BY ITS CHOICES: "one of contain | cover | …" says more than
  // `string`, and it is the answer a reader is actually after.
  const options = spec["options"] as readonly string[] | undefined;
  if (options) return options.map((o) => (o === "" ? "«none»" : o)).join(" | ");
  // No control and no options: Storybook infers a checkbox from the boolean default.
  return "boolean";
}

/**
 * A control's description, as a GETTER over the catalog's bundle, with the TYPE in front.
 *
 * Not a literal string. Prose baked into a story is prose that can never follow the language
 * switch — the rule the pages have obeyed from the start, and control descriptions are prose
 * like any other. A getter is what makes it work at all here: `argTypes` is a static object
 * read at render time, so the property has to be looked up when it is asked for rather than
 * when the module loaded.
 *
 * The type comes first because it is the shorter question. "What may I put here" is answered in
 * one word, and a reader who only needed that stops reading; Storybook's own type line sits
 * BELOW the prose, where it is found last.
 */
export function documented(
  key: string,
  spec: Record<string, unknown>,
  /**
   * The FIELD these controls make up, if they make up one.
   *
   * A field of the model is rarely one control: `bounds` is a `Shape`, and a reader edits it
   * through seven. Left flat, the panel is a heap — `kind, w, h, r, corners…` with nothing
   * saying whose they are, and the field's own name appears nowhere at all. That is exactly
   * how a reader ends up unable to say what `bounds` even is.
   */
  category?: string,
): Record<string, unknown> {
  const type = typeOf(spec);
  return Object.defineProperties(
    // The inferred type row is suppressed, or the same word appears twice on every row — once
    // where it is useful and once where it is noise.
    { ...spec, table: { type: { summary: null }, ...(category ? { category } : {}) } },
    {
      description: {
        enumerable: true,
        get: () => `\`${type}\` — ${currentSettings().text.text(key as Parameters<CatalogText["text"]>[0])}`,
      },
    },
  ) as Record<string, unknown>;
}

export { PRESETS, SHAPE_ARGS, shapeOf, shapeSource, type Preset, type ShapeArgs } from "./shape.js";

// ---- the shape ------------------------------------------------------------------------------

export function shapeArgTypes(category = "bounds"): Record<string, unknown> {
  // ONE EQUALITY, because that is all Storybook has. `eq`, `neq`, `exists`, `truthy` — there is
  // no "one of", and a condition written as a list is not rejected, it is IGNORED: the control
  // then shows on every page, which is how a width appeared on the circle.
  const shown = (preset: string): Record<string, unknown> => ({ if: { arg: "preset", eq: preset } });
  // Numbers, not sliders. A size is a VALUE the reader wants to state — "1.5 units wide" — and
  // a range control cannot be told that: it can only be dragged near it.
  const number = (min: number, step: number) => ({ control: { type: "number", min, step } });
  const doc = (name: keyof ShapeArgs, spec: Record<string, unknown>): Record<string, unknown> =>
    documented(`arg.${name}`, spec, category);
  // NOT THE FIELD, AND SAID SO BY THE SECTION IT IS IN. The scale/turn/move fit a pasted shape
  // before it becomes `bounds`; what reaches the model is the transformed shape. They were in
  // the `bounds` group at first, and that said `Bounded` has a rotation. It does not — those
  // words belong to a POSE.
  const build = (name: keyof ShapeArgs, spec: Record<string, unknown>): Record<string, unknown> =>
    documented(`arg.${name}`, spec, "builder");
  return {
    // The PRESET, not a sort: every one of these is a helper the kit exports, and the snippet
    // shows the call. A `Shape` itself has no sorts to pick from.
    // The PRESET, not a sort: every one of these is a helper the kit exports, and the snippet
    // shows the call. A `Shape` itself has no sorts to pick from.
    preset: doc("preset", { control: "select", options: PRESETS }),
    w: doc("w", { ...number(0, 0.1), ...shown("rect") }),
    h: doc("h", { ...number(0, 0.1), ...shown("rect") }),
    radius: doc("radius", { ...number(0, 0.05), ...shown("rect") }),
    r: doc("r", { ...number(0, 0.1), ...shown("circle") }),
    rx: doc("rx", { ...number(0, 0.1), ...shown("ellipse") }),
    ry: doc("ry", { ...number(0, 0.1), ...shown("ellipse") }),
    corners: doc("corners", { control: { type: "range", min: 3, max: 16, step: 1 }, ...shown("polygon") }),
    polyR: doc("polyR", { ...number(0, 0.1), ...shown("polygon") }),
    points: doc("points", { control: { type: "range", min: 3, max: 16, step: 1 }, ...shown("star") }),
    outerR: doc("outerR", { ...number(0, 0.1), ...shown("star") }),
    innerR: doc("innerR", { ...number(0, 0.1), ...shown("star") }),
    // Text for both of these. A pasted `d` arrives through the clipboard and a form that made
    // somebody retype it would be used by nobody; a hand-written path is a list whose LENGTH is
    // the point — two pairs are a line, one is a point — and no numeric control has a length.
    vertices: doc("vertices", { control: "text", ...shown("path") }),
    d: doc("d", { control: "text", ...shown("svg") }),

    scaleX: build("scaleX", number(0, 0.1)),
    scaleY: build("scaleY", number(0, 0.1)),
    rotate: build("rotate", { control: { type: "number", step: 15 } }),
    offsetX: build("offsetX", { control: { type: "number", step: 0.1 } }),
    offsetY: build("offsetY", { control: { type: "number", step: 0.1 } }),
  };
}

export function shapeArgs(over: Partial<ShapeArgs> = {}): ShapeArgs {
  return { ...SHAPE_ARGS, ...over };
}

// ---- the record -----------------------------------------------------------------------------

/**
 * Grouped as `surface`, and that is a different KIND of group from `bounds`.
 *
 * `bounds` is one field taken apart. These are the fields of a registered RECORD, which the
 * node does not hold at all — it holds the name the record is filed under. The section title
 * is what says so on the panel; without it the border's colour sits beside the box's width as
 * though they lived in the same place.
 */
const rec = (key: string, spec: Record<string, unknown>): Record<string, unknown> =>
  documented(key, spec, "surface");

export const RECORD_ARG_TYPES: Record<string, unknown> = {
  fill: rec("arg.fill", { control: "select", options: PAINTS }),
  // A literal beside the token on purpose. Switch the theme with a token and the surface
  // follows; with a literal it does not, and that is the difference the palette exists for.
  fillCustom: documented("arg.fillCustom", { control: "color" }),
  fillOpacity: documented("arg.fillOpacity", { control: { type: "range", min: 0, max: 1, step: 0.05 } }),
  // The list comes from the REGISTRY, plus the empty choice: a layer without a picture is the
  // ordinary case, not a missing value.
  image: documented("arg.image", { control: "select", options: ["", ...assetNames()] }),
  fit: documented("arg.fit", { control: "select", options: FITS, if: { arg: "image", neq: "" } }),
  align: documented("arg.align", { control: "select", options: ALIGNS, if: { arg: "image", neq: "" } }),
  radius: documented("arg.radius", { control: { type: "number", min: 0, step: 0.02 } }),
  strokeColor: documented("arg.strokeColor", { control: "select", options: PAINTS, if: { arg: "stroke" } }),
  strokeCustom: documented("arg.strokeCustom", { control: "color", if: { arg: "stroke" } }),
  strokeWidth: documented("arg.strokeWidth", { control: { type: "number", min: 0, step: 0.01 }, if: { arg: "stroke" } }),
  strokeOpacity: documented("arg.strokeOpacity", { control: { type: "range", min: 0, max: 1, step: 0.05 }, if: { arg: "stroke" } }),
  // Pixi's scale and SVG 2's stroke-alignment: 0 outside the contour, 0.5 on it, 1 inside.
  alignment: documented("arg.alignment", { control: { type: "range", min: 0, max: 1, step: 0.5 }, if: { arg: "stroke" } }),
  cap: documented("arg.cap", { control: "inline-radio", options: ["butt", "round", "square"], if: { arg: "stroke" } }),
  join: documented("arg.join", { control: "inline-radio", options: ["miter", "round", "bevel"], if: { arg: "stroke" } }),
  miterLimit: documented("arg.miterLimit", { control: { type: "number", min: 1, step: 1 }, if: { arg: "join", eq: "miter" } }),
  dash: documented("arg.dash", { if: { arg: "stroke" } }),
  dashOn: documented("arg.dashOn", { control: { type: "number", min: 0.01, step: 0.01 }, if: { arg: "dash" } }),
  dashOff: documented("arg.dashOff", { control: { type: "number", min: 0.01, step: 0.01 }, if: { arg: "dash" } }),
  dashAdjust: documented("arg.dashAdjust", { control: "inline-radio", options: ["stretch", "none"], if: { arg: "dash" } }),
  dashCorner: documented("arg.dashCorner", { control: "inline-radio", options: ["dash", "none"], if: { arg: "dash" } }),
};

