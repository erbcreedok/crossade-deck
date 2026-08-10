// THE RECORD, AS A VALUE — split out of `surfaceControls.ts` for the same reason `shape.ts` was.
//
// The Code panel is drawn by the MANAGER, a second document with its own module graph. It has to
// be able to say what a row of controls comes out AS without dragging the palette and the asset
// registry in behind it, and those are what the control declarations need. So the value half
// lives here and the panel half stays there.

import { type DashPattern, type LineCap, type LineJoin, type Paint, type SurfaceRecord } from "../../src/index.js";

/** Every `Fit` the arithmetic knows. Listed here so a new one has to be offered, not just added. */
export const FITS = ["contain", "cover", "fill", "original", "repeat", "fitX", "fitY"] as const;

/** Every `Align`. Same reason. */
export const ALIGNS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
] as const;

export interface RecordArgs {
  fill: string;
  /** A literal colour. Set, it wins over the token — which is the lesson, not a convenience. */
  fillCustom: string;
  fillOpacity: number;
  /** A registered picture, or "" for none. The layer is a colour, a picture, or both. */
  image: string;
  fit: (typeof FITS)[number];
  align: (typeof ALIGNS)[number];
  radius: number;
  stroke: boolean;
  strokeColor: string;
  strokeCustom: string;
  strokeWidth: number;
  strokeOpacity: number;
  alignment: number;
  cap: LineCap;
  join: LineJoin;
  miterLimit: number;
  dash: boolean;
  dashOn: number;
  dashOff: number;
  dashAdjust: "none" | "stretch";
  dashCorner: "none" | "dash";
}

export const RECORD_ARGS: RecordArgs = {
  fill: "panelBg",
  fillCustom: "",
  fillOpacity: 1,
  image: "",
  fit: "contain",
  align: "center",
  radius: 0.08,
  stroke: true,
  strokeColor: "accent",
  strokeCustom: "",
  strokeWidth: 0.03,
  strokeOpacity: 1,
  alignment: 1,
  cap: "butt",
  join: "miter",
  miterLimit: 10,
  dash: false,
  dashOn: 0.14,
  dashOff: 0.09,
  dashAdjust: "stretch",
  dashCorner: "dash",
};

/** A token name unless a literal was picked. Both are legal `Paint`s; only one follows a theme. */
export function paintOf(token: string, custom: string): Paint {
  return custom ? custom : token;
}

export function recordOf(a: RecordArgs): SurfaceRecord {
  const dash: DashPattern = { on: a.dashOn, off: a.dashOff, adjust: a.dashAdjust, corner: a.dashCorner };
  return {
    layers: [
      {
        paint: paintOf(a.fill, a.fillCustom),
        opacity: a.fillOpacity,
        ...(a.image ? { image: a.image, fit: a.fit, align: a.align } : {}),
      },
    ],
    radius: a.radius,
    ...(a.stroke
      ? {
          stroke: {
            color: paintOf(a.strokeColor, a.strokeCustom),
            width: a.strokeWidth,
            opacity: a.strokeOpacity,
            alignment: a.alignment,
            cap: a.cap,
            join: a.join,
            miterLimit: a.miterLimit,
            ...(a.dash ? { dash } : {}),
          },
        }
      : {}),
  };
}

/**
 * The record as the LITERAL a reader would write, for the Code panel.
 *
 * ONE LINE, however long. The snippet is assembled by substitution into a line of the story's own
 * source, so anything with newlines in it lands at that line's indent and the rest hangs off the
 * left margin. A long record scrolls; a misaligned one just looks broken.
 */
export function recordSource(a: RecordArgs): string {
  const q = (v: string): string => JSON.stringify(v);
  const n = (v: number): string => String(Number(v.toFixed(4)));
  const layer = [
    `paint: ${q(paintOf(a.fill, a.fillCustom))}`,
    a.fillOpacity !== 1 ? `opacity: ${n(a.fillOpacity)}` : "",
    a.image ? `image: ${q(a.image)}, fit: ${q(a.fit)}, align: ${q(a.align)}` : "",
  ].filter(Boolean);
  const parts = [`layers: [{ ${layer.join(", ")} }]`, `radius: ${n(a.radius)}`];
  if (a.stroke) {
    const stroke = [
      `color: ${q(paintOf(a.strokeColor, a.strokeCustom))}`,
      `width: ${n(a.strokeWidth)}`,
      a.strokeOpacity !== 1 ? `opacity: ${n(a.strokeOpacity)}` : "",
      `alignment: ${n(a.alignment)}`,
      a.cap !== "butt" ? `cap: ${q(a.cap)}` : "",
      a.join !== "miter" ? `join: ${q(a.join)}` : "",
      a.join === "miter" && a.miterLimit !== 10 ? `miterLimit: ${n(a.miterLimit)}` : "",
      a.dash ? `dash: { on: ${n(a.dashOn)}, off: ${n(a.dashOff)}, adjust: ${q(a.dashAdjust)}, corner: ${q(a.dashCorner)} }` : "",
    ].filter(Boolean);
    parts.push(`stroke: { ${stroke.join(", ")} }`);
  }
  return `{ ${parts.join(", ")} }`;
}

/**
 * THE SAME ARGUMENTS, UNDER A PREFIX — for a scene where more than one node wears a record.
 *
 * `arrow()` comes back as three nodes, and each of them has a whole record of its own. The panel
 * shows all three, so the arguments have to be told apart: `startFill` is the head's fill and
 * `fill` is the line's. This is the one place that knows how the two names relate, and it is one
 * function rather than a second copy of the twenty-one fields.
 */
export function recordArgsAt(prefix: string, over: Partial<RecordArgs> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries({ ...RECORD_ARGS, ...over })) {
    out[`${prefix}${name[0]!.toUpperCase()}${name.slice(1)}`] = value;
  }
  return out;
}

/** The prefixed slice of a story's arguments, as the plain `RecordArgs` every reader here takes. */
export function recordSliceOf(a: object, prefix: string): RecordArgs {
  const from = a as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(RECORD_ARGS)) {
    out[name] = from[`${prefix}${name[0]!.toUpperCase()}${name.slice(1)}`];
  }
  return out as unknown as RecordArgs;
}

/**
 * A NAME PER PREFIX, and not one function taking the prefix as a second argument.
 *
 * The Code panel substitutes a call whose only argument is the args object — that is the whole
 * mechanism, and a helper with two arguments cannot be substituted at all. It would then print as
 * itself: a name that exists nowhere but this catalog, in the panel a reader copies from.
 */
export const startRecordOf = (a: object): SurfaceRecord => recordOf(recordSliceOf(a, "start"));
export const endRecordOf = (a: object): SurfaceRecord => recordOf(recordSliceOf(a, "end"));

export const startRecordSource = (a: object): string => recordSource(recordSliceOf(a, "start"));
export const endRecordSource = (a: object): string => recordSource(recordSliceOf(a, "end"));
