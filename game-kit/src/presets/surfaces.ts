// THE STOCK RECORDS — the looks the kit already has, next to the shapes it already has.
//
// A record is DATA: token names and lengths in units, no textures and no matrices. That is what
// lets these sit above the renderer instead of inside it — `render/surfaces.ts` knows what a
// record IS and holds the registry; this file is the answer to "what is already in it".
//
// The tokens are the EXISTING ones, deliberately: the palette's rule is one job per token, and a
// `surfaceFill` holding exactly what `panelBg` holds would be the second token for one job that
// the rule forbids. When a real card face arrives its job genuinely differs, and it gets its own
// token then — not now, on speculation.

import { registerSurface } from "../render/surfaces.js";

/**
 * `plate` is what `Surfaced` defaults to, so a node composed with no arguments is visible rather
 * than mysteriously blank; `bare` is the same plate with the stroke taken away, which is what the
 * catalog switches to in order to show that the box outlives the look; `zone` is the marked-out
 * area — see-through ground and a dashed edge.
 *
 * `ink` and `trail` are the two with NO layers at all, for the shapes that enclose nothing: a
 * line is its stroke and has no inside to paint. They are also where a reader finds out that the
 * pattern of a path lives in the record and not in the geometry — the same walk under `trail` is
 * a dashed one, and the shape did not change.
 *
 * `mark` is the other half of that pair and the reason a head is its own node: solid accent, no
 * stroke, no radius. A filled arrowhead on a hairline run is two records, and it could not be
 * anything else — one node wears one record.
 */
export function installStockSurfaces(): void {
  registerSurface("plate", {
    layers: [{ paint: "panelBg" }],
    radius: 0.08,
    // Inside the contour, so a bordered node occupies exactly the box it declared. Centred,
    // half the stroke would hang over neighbours the layout carefully spaced it from.
    stroke: { color: "accent", width: 0.03, alignment: 1 },
  });
  registerSurface("bare", { layers: [{ paint: "panelBg" }], radius: 0.08 });
  registerSurface("zone", {
    layers: [{ paint: "panelBg", opacity: 0.35 }],
    radius: 0.08,
    stroke: {
      color: "accent",
      width: 0.02,
      alignment: 1,
      dash: { on: 0.14, off: 0.09, adjust: "stretch", corner: "dash" },
    },
  });
  registerSurface("ink", {
    layers: [],
    // Centred and round at both the ends and the turns: a path drawn with any other cap grows a
    // notch wherever it doubles back on itself, and doubling back is how a line is walked here.
    stroke: { color: "accent", width: 0.04, alignment: 0.5, cap: "round", join: "round" },
  });
  registerSurface("mark", { layers: [{ paint: "accent" }] });
  registerSurface("trail", {
    layers: [],
    stroke: {
      color: "accent",
      width: 0.04,
      alignment: 0.5,
      cap: "butt",
      join: "round",
      dash: { on: 0.12, off: 0.1 },
    },
  });
}
