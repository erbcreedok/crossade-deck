import type { Meta, StoryObj } from "@storybook/html";
import { Bounded, circle, line, node, rect, Surfaced } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// PRESETS THAT GENERATE A SURFACE — one page per stock record, and nothing to tune but the box.
//
// `plate`, `bare`, `zone`, `ink`, `mark` and `trail` are DATA the kit ships already registered —
// see `presets/surfaces.ts` for what each one holds. A page here is not a place to rebuild that
// record from its parts: that whole panel already lives on `Atoms/Surfaced → Plate`, one field
// at a time. This shelf answers a different question — "what does this NAME already look like" —
// so the only controls are the shape it is shown on, never the record itself.
//
// `ink` and `trail` are shown on a `line`, not a box: both are stroke-only, for a path that walks
// out and back and has no inside to fill. `mark` is shown on a `circle`, the opposite case — solid
// accent, no stroke, for a shape that DOES have one.

const place = (key: string, part: string): Record<string, unknown> =>
  documented(key, { control: { type: "number", step: 0.05 } }, `line/${part}`);

interface BoxArgs {
  id: string;
  w: number;
  h: number;
}

const boxArgTypes = {
  id: documented("arg.id", { control: "text" }, "node"),
  w: documented("arg.w", { control: { type: "number", min: 0, step: 0.1 } }, "bounds"),
  h: documented("arg.h", { control: { type: "number", min: 0, step: 0.1 } }, "bounds"),
};

const meta: Meta = {
  title: "Presets/Surfaces",
  parameters: { gkDoc: "presetsSurfaces.component" },
};
export default meta;

export const Plate: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: rect(a.w, a.h) }), Surfaced({ surface: "plate" }))).el,
  args: { id: "card", w: 2, h: 1.4 },
  argTypes: boxArgTypes,
  parameters: { gkDocStory: "presetsSurfaces.plate" },
};

export const Bare: StoryObj<BoxArgs> = {
  // The same box, the stroke taken away — proof the box outlives the look: reregister the name
  // and every card wearing it loses its border in one step, and neither one moves a unit.
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: rect(a.w, a.h) }), Surfaced({ surface: "bare" }))).el,
  args: { id: "card", w: 2, h: 1.4 },
  argTypes: boxArgTypes,
  parameters: { gkDocStory: "presetsSurfaces.bare" },
};

export const Zone: StoryObj<BoxArgs> = {
  // The marked-out area: see-through ground, a dashed edge — the look a desk or a drop target
  // reaches for when it wants to say "here", not "this is a card".
  render: (a) => scene(node(a.id.trim() || "area", Bounded({ bounds: rect(a.w, a.h) }), Surfaced({ surface: "zone" }))).el,
  args: { id: "area", w: 3, h: 2 },
  argTypes: boxArgTypes,
  parameters: { gkDocStory: "presetsSurfaces.zone" },
};

interface RunArgs {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  bend: number;
}

const runArgTypes = {
  id: documented("arg.id", { control: "text" }, "node"),
  fromX: place("arg.fromX", "from"),
  fromY: place("arg.fromY", "from"),
  toX: place("arg.toX", "to"),
  toY: place("arg.toY", "to"),
  bend: documented("arg.bend", { control: { type: "range", min: -1, max: 1, step: 0.05 } }, "line"),
};

const RUN = { fromX: -1.1, fromY: 0, toX: 1.1, toY: 0, bend: 0 };

export const Ink: StoryObj<RunArgs> = {
  // A stroke and nothing else — for a shape with no inside. `ink` and `trail` are the only two
  // stock records with no fill layer at all, which is what a path walked out and back actually
  // needs: everything visible is the line.
  render: (a) => {
    const run = line({ from: { x: a.fromX, y: a.fromY }, to: { x: a.toX, y: a.toY }, bend: a.bend });
    return scene(node("path", Bounded({ bounds: run }), Surfaced({ surface: "ink" }))).el;
  },
  args: { id: "path", ...RUN },
  argTypes: runArgTypes,
  parameters: { gkDocStory: "presetsSurfaces.ink" },
};

export const Trail: StoryObj<RunArgs> = {
  // The same run, dashed. The path did not change — the record did, and that is the whole
  // lesson: the pattern on a line lives in the SURFACE, not in the geometry.
  render: (a) => {
    const run = line({ from: { x: a.fromX, y: a.fromY }, to: { x: a.toX, y: a.toY }, bend: a.bend });
    return scene(node("path", Bounded({ bounds: run }), Surfaced({ surface: "trail" }))).el;
  },
  args: { id: "path", ...RUN, bend: 0.3 },
  argTypes: runArgTypes,
  parameters: { gkDocStory: "presetsSurfaces.trail" },
};

export const Mark: StoryObj<{ id: string; r: number }> = {
  // The other half of the `ink`/`mark` pair, on a shape that HAS an inside: solid accent, no
  // stroke, no radius. The reason a head is its own node rather than a detour in a line's own
  // contour — a filled mark on a hairline run is two records, and one node wears one record.
  render: (a) => scene(node(a.id.trim() || "dot", Bounded({ bounds: circle(a.r) }), Surfaced({ surface: "mark" }))).el,
  args: { id: "dot", r: 0.6 },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    r: documented("arg.r", { control: { type: "number", min: 0, step: 0.05 } }, "bounds"),
  },
  parameters: { gkDocStory: "presetsSurfaces.mark" },
};
