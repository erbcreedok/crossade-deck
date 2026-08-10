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
export {
  ALIGNS,
  FITS,
  bothRecordOf,
  cloneRecordOf,
  endRecordOf,
  endRecordSource,
  overriddenSliceOf,
  OVERRIDE_ARGS,
  paintOf,
  recordArgsAt,
  recordOf,
  recordSliceOf,
  recordSource,
  startRecordOf,
  startRecordSource,
  RECORD_ARGS,
  type RecordArgs,
} from "./record.js";
import { ALIGNS, FITS, paintOf, recordOf, RECORD_ARGS, type RecordArgs } from "./record.js";
import {
  assetNames,
  installStockHeads,
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
installStockHeads();
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
   * The FIELD these controls make up, if they make up one — `"field"` or `"field/part"`.
   *
   * A field of the model is rarely one control: `bounds` is a `Shape`, and a reader edits it
   * through seven. Left flat, the panel is a heap — `kind, w, h, r, corners…` with nothing
   * saying whose they are, and the field's own name appears nowhere at all. That is exactly
   * how a reader ends up unable to say what `bounds` even is.
   *
   * The half after the slash is a section INSIDE that one, and it exists because a field can be
   * deep: a record holds layers, a stroke, and a dash pattern inside the stroke. Twenty rows
   * under one heading are a heap with a title on it, which is barely better than a heap. The
   * nesting shown is the value's OWN — `layers[0]`, `stroke`, `stroke.dash` — so the panel can
   * be read as the object a reader would write.
   */
  section?: string,
): Record<string, unknown> {
  const type = typeOf(spec);
  const [category, subcategory] = section ? section.split("/") : [];
  return Object.defineProperties(
    // The inferred type row is suppressed, or the same word appears twice on every row — once
    // where it is useful and once where it is noise.
    {
      ...spec,
      table: {
        type: { summary: null },
        ...(category ? { category } : {}),
        ...(subcategory ? { subcategory } : {}),
      },
    },
    {
      description: {
        enumerable: true,
        get: () => `\`${type}\` — ${currentSettings().text.text(key as Parameters<CatalogText["text"]>[0])}`,
      },
    },
  ) as Record<string, unknown>;
}

export { PRESETS, SHAPE_ARGS, shapeOf, shapeSource, type Preset, type ShapeArgs } from "./shape.js";
export {
  cardPoseOf,
  handPoseOf,
  POSE_ARGS,
  poseArgsAt,
  poseOf,
  poseSliceOf,
  type PoseArgs,
} from "./pose.js";
import { type PoseArgs } from "./pose.js";

// ---- the pose -------------------------------------------------------------------------------

/**
 * THE POSE'S CONTROLS, ONCE — the whole of `Transformable`, for every node that has one.
 *
 * `field` is the group the rows land in, and it NAMES THE ATOM: on a page where a bound and a
 * record sit on the same panel, `hand transformable` against `surface` is what says which atom a
 * row belongs to. `prefix` tells two posed nodes apart, exactly as the record's does.
 */
export function poseArgTypes(field = "transformable", prefix = ""): Record<string, unknown> {
  const at = (name: keyof PoseArgs): string => (prefix ? `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` : name);
  const doc = (name: keyof PoseArgs, spec: Record<string, unknown>): Record<string, unknown> =>
    documented(`arg.${name}`, spec, field);
  return {
    [at("x")]: doc("x", { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } }),
    [at("y")]: doc("y", { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } }),
    // Whole steps: `z` is an order, not a distance. Half a rung above a card means nothing.
    [at("z")]: doc("z", { control: { type: "range", min: -2, max: 2, step: 1 } }),
    // Fifteen at a time, because that is how anyone actually turns a card: by a notch, not to
    // 37.4 degrees. A number and not a range, so a reader can type 450 and watch it equal 90.
    [at("angle")]: doc("angle", { control: { type: "number", step: 15 } }),
    [at("scale")]: doc("scale", { control: { type: "number", min: 0, step: 0.1 } }),
  };
}

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
    fromX: doc("fromX", { control: { type: "number", step: 0.05 }, ...shown("line") }),
    fromY: doc("fromY", { control: { type: "number", step: 0.05 }, ...shown("line") }),
    toX: doc("toX", { control: { type: "number", step: 0.05 }, ...shown("line") }),
    toY: doc("toY", { control: { type: "number", step: 0.05 }, ...shown("line") }),
    bend: doc("bend", { control: { type: "range", min: -1, max: 1, step: 0.05 }, ...shown("line") }),
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
 * THE RECORD'S CONTROLS, ONCE — and handed out again for every node that wears one.
 *
 * `bounds` is one field taken apart. These are the fields of a registered RECORD, which the node
 * does not hold at all — it holds the name the record is filed under. The section title is what
 * says so on the panel; without it the border's colour sits beside the box's width as though they
 * lived in the same place.
 *
 * EVERY ROW CARRIES ITS SECTION, and the guard `controls.every-record-control-names-its-field` is
 * what keeps it that way. Only `fill` used to, so the panel showed a group called `surface` holding
 * one control and nineteen loose rows above it with no heading at all — which reads as a group
 * somebody meant something by rather than the omission it was.
 *
 * `field` is the group the rows land in, `prefix` is what their argument names start with, and
 * `inside` is where they sit within that group. Together they are what lets a scene with THREE
 * nodes give each of them the whole record: `recordArgTypes("start", "start", "surface")` puts
 * `startFill` under `start → surface.layers[0]`, wearing the same word as every other `fill` on the
 * site. Twenty-one declarations written three times would have drifted apart by the second one.
 */
export function recordArgTypes(field = "surface", prefix = "", inside = ""): Record<string, unknown> {
  const at = (name: string): string => (prefix ? `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` : name);
  const dot = inside ? `${inside}.` : "";
  const rec = (key: string, spec: Record<string, unknown>, part = ""): Record<string, unknown> =>
    documented(key, spec, part ? `${field}/${dot}${part}` : inside ? `${field}/${inside}` : field);
  /** The layer the panel builds — a record holds a LIST, and these controls make its first one. */
  const layer = (key: string, spec: Record<string, unknown>): Record<string, unknown> => rec(key, spec, "layers[0]");
  /** Shown only when there IS a stroke: an absent stroke has no colour to be asked about. */
  const stroked = (key: string, spec: Record<string, unknown>): Record<string, unknown> =>
    rec(key, { ...spec, if: { arg: at("stroke") } }, "stroke");
  /** The dash pattern, which lives INSIDE the stroke and disappears with it. */
  const dashed = (key: string, spec: Record<string, unknown>): Record<string, unknown> =>
    rec(key, { ...spec, if: { arg: at("dash") } }, "stroke.dash");

  return {
    [at("fill")]: layer("arg.fill", { control: "select", options: ["", ...PAINTS] }),
    // A literal beside the token on purpose. Switch the theme with a token and the surface
    // follows; with a literal it does not, and that is the difference the palette exists for.
    [at("fillCustom")]: layer("arg.fillCustom", { control: "color" }),
    [at("fillOpacity")]: layer("arg.fillOpacity", { control: { type: "range", min: 0, max: 1, step: 0.05 } }),
    // The list comes from the REGISTRY, plus the empty choice: a layer without a picture is the
    // ordinary case, not a missing value.
    [at("image")]: layer("arg.image", { control: "select", options: ["", ...assetNames()] }),
    [at("fit")]: layer("arg.fit", { control: "select", options: FITS, if: { arg: at("image"), neq: "" } }),
    [at("align")]: layer("arg.align", { control: "select", options: ALIGNS, if: { arg: at("image"), neq: "" } }),
    [at("radius")]: rec("arg.radius", { control: { type: "number", min: 0, step: 0.02 } }),
    // THE TOGGLE THE PANEL FORGOT. Fifteen rows below hang off `if: { arg: "stroke" }`, and the
    // argument they are asking about had no declaration at all: Storybook inferred a checkbox
    // from the default, so it arrived with no description, no type and no section — the one
    // control on the page that decides whether the others exist.
    [at("stroke")]: rec("arg.stroke", {}),
    [at("strokeColor")]: stroked("arg.strokeColor", { control: "select", options: PAINTS }),
    [at("strokeCustom")]: stroked("arg.strokeCustom", { control: "color" }),
    [at("strokeWidth")]: stroked("arg.strokeWidth", { control: { type: "number", min: 0, step: 0.01 } }),
    [at("strokeOpacity")]: stroked("arg.strokeOpacity", { control: { type: "range", min: 0, max: 1, step: 0.05 } }),
    // Pixi's scale and SVG 2's stroke-alignment: 0 outside the contour, 0.5 on it, 1 inside.
    [at("alignment")]: stroked("arg.alignment", { control: { type: "range", min: 0, max: 1, step: 0.5 } }),
    [at("cap")]: stroked("arg.cap", { control: "inline-radio", options: ["butt", "round", "square"] }),
    [at("join")]: stroked("arg.join", { control: "inline-radio", options: ["miter", "round", "bevel"] }),
    // The one row whose condition is not the stroke: a miter limit is a property of a MITER, and
    // it means nothing beside a round join.
    [at("miterLimit")]: rec(
      "arg.miterLimit",
      { control: { type: "number", min: 1, step: 1 }, if: { arg: at("join"), eq: "miter" } },
      "stroke",
    ),
    [at("dash")]: stroked("arg.dash", {}),
    [at("dashOn")]: dashed("arg.dashOn", { control: { type: "number", min: 0.01, step: 0.01 } }),
    [at("dashOff")]: dashed("arg.dashOff", { control: { type: "number", min: 0.01, step: 0.01 } }),
    [at("dashAdjust")]: dashed("arg.dashAdjust", { control: "inline-radio", options: ["stretch", "none"] }),
    [at("dashCorner")]: dashed("arg.dashCorner", { control: "inline-radio", options: ["dash", "none"] }),
  };
}

/** The unprefixed set, for a scene with one node wearing one record. */
export const RECORD_ARG_TYPES: Record<string, unknown> = recordArgTypes();

/**
 * The record's rows AS OVERRIDES — same fields, same sections, but every control can also say
 * "as the base": "" on a select, an empty number field, and a three-way switch where the record
 * has a toggle. Values live in `OVERRIDE_ARGS` / `overriddenSliceOf` (record.ts).
 *
 * Two deliberate differences from `recordArgTypes`. Sub-rows hide only when their part is
 * overridden AWAY (`neq: "off"`), never when it is merely not overridden — the base may well
 * have a stroke the override wants to retune. And `fit`/`align` are not chained to the image
 * row: the base's own picture is exactly what a reader may want to seat differently.
 */
export function overrideArgTypes(field: string): Record<string, unknown> {
  const at = (name: string): string => `over${name[0]!.toUpperCase()}${name.slice(1)}`;
  const rec = (key: string, spec: Record<string, unknown>, part = ""): Record<string, unknown> =>
    documented(key, spec, part ? `${field}/${part}` : field);
  const layer = (key: string, spec: Record<string, unknown>): Record<string, unknown> => rec(key, spec, "layers[0]");
  const stroked = (key: string, spec: Record<string, unknown>, part = "stroke"): Record<string, unknown> =>
    rec(key, { ...spec, if: { arg: at("stroke"), neq: "off" } }, part);
  const dashed = (key: string, spec: Record<string, unknown>): Record<string, unknown> =>
    rec(key, { ...spec, if: { arg: at("dash"), neq: "off" } }, "stroke.dash");
  const emptyOr = (options: readonly string[]): Record<string, unknown> => ({ control: "select", options: ["", ...options] });
  const number = (spec: Record<string, unknown> = {}): Record<string, unknown> => ({ control: { type: "number", ...spec } });

  return {
    [at("fill")]: layer("arg.fill", emptyOr(PAINTS)),
    [at("fillCustom")]: layer("arg.fillCustom", { control: "color" }),
    [at("fillOpacity")]: layer("arg.fillOpacity", number({ min: 0, max: 1, step: 0.05 })),
    [at("image")]: layer("arg.image", emptyOr(assetNames())),
    [at("fit")]: layer("arg.fit", emptyOr(FITS)),
    [at("align")]: layer("arg.align", emptyOr(ALIGNS)),
    [at("radius")]: rec("arg.radius", number({ min: 0, step: 0.02 })),
    [at("stroke")]: rec("arg.stroke", emptyOr(["on", "off"])),
    [at("strokeColor")]: stroked("arg.strokeColor", emptyOr(PAINTS)),
    [at("strokeCustom")]: stroked("arg.strokeCustom", { control: "color" }),
    [at("strokeWidth")]: stroked("arg.strokeWidth", number({ min: 0, step: 0.01 })),
    [at("strokeOpacity")]: stroked("arg.strokeOpacity", number({ min: 0, max: 1, step: 0.05 })),
    [at("alignment")]: stroked("arg.alignment", number({ min: 0, max: 1, step: 0.5 })),
    [at("cap")]: stroked("arg.cap", emptyOr(["butt", "round", "square"])),
    [at("join")]: stroked("arg.join", emptyOr(["miter", "round", "bevel"])),
    [at("miterLimit")]: stroked("arg.miterLimit", number({ min: 1, step: 1 })),
    [at("dash")]: stroked("arg.dash", emptyOr(["on", "off"])),
    [at("dashOn")]: dashed("arg.dashOn", number({ min: 0.01, step: 0.01 })),
    [at("dashOff")]: dashed("arg.dashOff", number({ min: 0.01, step: 0.01 })),
    [at("dashAdjust")]: dashed("arg.dashAdjust", emptyOr(["stretch", "none"])),
    [at("dashCorner")]: dashed("arg.dashCorner", emptyOr(["dash", "none"])),
  };
}
