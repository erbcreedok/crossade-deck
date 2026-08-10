import type { Meta, StoryObj } from "@storybook/html";
import { Bounded, node } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, shapeArgTypes, shapeOf, SHAPE_ARGS, type ShapeArgs } from "./surfaceControls.js";

// PRESETS THAT GENERATE A BOUND — one page per helper, and nothing else on it.
//
// Every one of these is an ORDINARY FUNCTION the kit exports, returning the same `Shape` every
// other one does: `rect`, `circle`, `ellipse`, `polygon`, `star`, and the bendable `line`. They
// used to sit on `Atoms/Bounded`, sharing one panel with a `preset` dropdown across all eight —
// which meant a page named `Circle` let a reader flip it to `star` and see the exact same
// picture `Presets/Bounds → Star` shows. A story that can turn into a different story is not
// honest about what it draws, so each preset gets its OWN page and its OWN controls: no
// dropdown, no field belonging to a shape this page is not about.
//
// The underlying mechanism (`shapeOf`, the shared `preset` switcher) is unchanged and still
// wired for `Atoms/Surfaced → Plate`, whose whole point IS "any shape at all" — a genuinely
// different lesson from this shelf's "here is what each helper gives you". `controls.include`
// is what tells the two apart: Plate shows every field, each story here shows one preset's own.
//
// What is NOT here: `Atoms/Bounded` keeps the pages about the FIELD itself rather than a named
// helper — a raw value, a hand-built path, a pasted SVG. This shelf is the ready-made half.

interface BoxArgs extends ShapeArgs {
  id: string;
}

const meta: Meta<BoxArgs> = {
  title: "Presets/Bounds",
  parameters: { gkDoc: "presetsBounds.component" },
  args: { ...SHAPE_ARGS },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    ...shapeArgTypes(),
  },
};
export default meta;

export const Rect: StoryObj<BoxArgs> = {
  // `w` and `h` are the whole of it; bring `radius` up off zero and the same call becomes
  // `roundedRect` — one preset either way, since the kit's own switcher treats them as one shape
  // rounded by a number rather than two sorts of box.
  render: (a) => scene(node(a.id.trim() || "card", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "card", preset: "rect", w: 2, h: 1.4, radius: 0 },
  parameters: { gkDocStory: "presetsBounds.rect", controls: { include: ["id", "w", "h", "radius"] } },
};

export const Circle: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "chip", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "chip", preset: "circle", r: 0.8 },
  parameters: { gkDocStory: "presetsBounds.circle", controls: { include: ["id", "r"] } },
};

export const Ellipse: StoryObj<BoxArgs> = {
  // The general case, not a stretched circle: `circle(r)` is `ellipse(r, r)`, one line of
  // arithmetic away rather than a sort of its own.
  render: (a) => scene(node(a.id.trim() || "token", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "token", preset: "ellipse", rx: 1.2, ry: 0.8 },
  parameters: { gkDocStory: "presetsBounds.ellipse", controls: { include: ["id", "rx", "ry"] } },
};

export const Polygon: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "badge", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "badge", preset: "polygon", corners: 5, polyR: 0.9 },
  parameters: { gkDocStory: "presetsBounds.polygon", controls: { include: ["id", "corners", "polyR"] } },
};

export const Star: StoryObj<BoxArgs> = {
  render: (a) => scene(node(a.id.trim() || "star", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "star", preset: "star", points: 5, outerR: 1, innerR: 0.42 },
  parameters: { gkDocStory: "presetsBounds.star", controls: { include: ["id", "points", "outerR", "innerR"] } },
};

export const Line: StoryObj<BoxArgs> = {
  // A run between two places, and the bend belongs to the BOX: a curve is geometry and nothing
  // else, so it is settled here rather than by whatever paints it or stands on its ends. At
  // `bend: 0` this is a straight line — the same call with a zero in it, not a second shape.
  render: (a) => scene(node(a.id.trim() || "rule", Bounded({ bounds: shapeOf(a) })), { bounds: true }).el,
  args: { id: "rule", preset: "line", fromX: -1.2, fromY: 0, toX: 1.2, toY: 0, bend: 0 },
  parameters: {
    gkDocStory: "presetsBounds.line",
    controls: { include: ["id", "fromX", "fromY", "toX", "toY", "bend"] },
  },
};
