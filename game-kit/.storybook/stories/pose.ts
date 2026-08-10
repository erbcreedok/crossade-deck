// THE POSE, AS A VALUE — the flat controls of `Transformable` and what they come out as.
//
// Split from the panel half for the same reason `record.ts` is: the Code panel is drawn by the
// MANAGER, a second document with its own module graph, and it has to be able to print what a
// row of pose controls stands for without dragging the palette in behind it.

import { type TransformableFields } from "../../src/index.js";

/** The atom's four fields as flat controls — `at` split into the two numbers a panel can hold. */
export interface PoseArgs {
  x: number;
  y: number;
  z: number;
  angle: number;
  scale: number;
}

/** The atom's own defaults, flat. An untouched panel is a node with no pose at all. */
export const POSE_ARGS: PoseArgs = { x: 0, y: 0, z: 0, angle: 0, scale: 1 };

/**
 * THE SAME ARGUMENTS, UNDER A PREFIX — for a scene where more than one node has a pose.
 *
 * A chain is at least two nodes, and each of them poses whole: `handAngle` is the hand's turn
 * and `cardAngle` the card's. One function rather than a second copy of the five fields, exactly
 * as the record does it.
 */
export function poseArgsAt(prefix: string, over: Partial<PoseArgs> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries({ ...POSE_ARGS, ...over })) {
    out[prefix ? `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` : name] = value;
  }
  return out;
}

/** The prefixed slice of a story's arguments, as the plain `PoseArgs` every reader here takes. */
export function poseSliceOf(a: object, prefix: string): PoseArgs {
  const from = a as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(POSE_ARGS)) {
    out[name] = from[prefix ? `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` : name];
  }
  return out as unknown as PoseArgs;
}

/**
 * The fields the panel actually SET. A default is not a decision, so it is not in the value:
 * `Transformable` fills its own defaults, and the snippet stays the line a reader would write —
 * the same rule `an-untouched-transform-is-not-printed` holds the shape builder to.
 */
export function poseFields(p: PoseArgs): Partial<TransformableFields> {
  return {
    ...(p.x !== 0 || p.y !== 0 ? { at: { x: p.x, y: p.y } } : {}),
    ...(p.z !== 0 ? { z: p.z } : {}),
    ...(p.angle !== 0 ? { angle: p.angle } : {}),
    ...(p.scale !== 1 ? { scale: p.scale } : {}),
  };
}

/** The pose as the LITERAL a reader would write — one line, for the Code panel's substitution. */
export function poseSourceOf(p: PoseArgs): string {
  const n = (v: number): string => String(Number(v.toFixed(4)));
  const parts = [
    p.x !== 0 || p.y !== 0 ? `at: { x: ${n(p.x)}, y: ${n(p.y)} }` : "",
    p.z !== 0 ? `z: ${n(p.z)}` : "",
    p.angle !== 0 ? `angle: ${n(p.angle)}` : "",
    p.scale !== 1 ? `scale: ${n(p.scale)}` : "",
  ].filter(Boolean);
  return parts.length ? `{ ${parts.join(", ")} }` : "{}";
}

// One name per node, same as the record's ends: the Code panel substitutes a call taking the
// args object and nothing else, so none of these can be one function with a prefix argument.
export const poseOf = (a: object): Partial<TransformableFields> => poseFields(poseSliceOf(a, ""));
export const handPoseOf = (a: object): Partial<TransformableFields> => poseFields(poseSliceOf(a, "hand"));
export const cardPoseOf = (a: object): Partial<TransformableFields> => poseFields(poseSliceOf(a, "card"));

export const poseSource = (a: object): string => poseSourceOf(poseSliceOf(a, ""));
export const handPoseSource = (a: object): string => poseSourceOf(poseSliceOf(a, "hand"));
export const cardPoseSource = (a: object): string => poseSourceOf(poseSliceOf(a, "card"));
