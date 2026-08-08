import type { Meta, StoryObj } from "@storybook/html";
import { Bounded, node, type Shape } from "../../src/index.js";
import { scene } from "../devtools/scene.js";

// The atom's FIELDS are the story's arguments — that is the whole reason controls exist here.
// A page of stories per value ("1×1", "2×1", "a circle") is a catalog of screenshots; one story
// whose box the reader can resize is the thing itself.
interface BoxArgs {
  shape: "rect" | "circle";
  w: number;
  h: number;
  r: number;
}

const meta: Meta<BoxArgs> = {
  title: "Start/Atoms/Bounded",
  parameters: { gkDoc: "bounded.component" },
  argTypes: {
    shape: { control: "inline-radio", options: ["rect", "circle"] },
    // Numbers, not sliders. A size is a VALUE the reader wants to state — "1.5 units wide" —
    // and a range control cannot be told that: it can only be dragged near it. A slider suits
    // a thing you sweep to see it change; a measurement you type.
    w: { control: { type: "number", min: 0.1, step: 0.1 }, if: { arg: "shape", eq: "rect" } },
    h: { control: { type: "number", min: 0.1, step: 0.1 }, if: { arg: "shape", eq: "rect" } },
    r: { control: { type: "number", min: 0.1, step: 0.1 }, if: { arg: "shape", eq: "circle" } },
  },
  args: { shape: "rect", w: 1, h: 1, r: 0.5 },
};
export default meta;

/** In units, never pixels — the host is the only thing that knows what a unit is worth. */
function sizeOf({ shape, w, h, r }: BoxArgs): Shape {
  return shape === "circle" ? { kind: "circle", r } : { kind: "rect", w, h };
}

export const Box: StoryObj<BoxArgs> = {
  // Nothing on screen whatever the arguments say, and that is the point of this rung: a box is
  // a place taken, not a look. Turn on `bounds` in the toolbar above to see the one you set.
  render: (args) => scene(node("card", Bounded({ size: sizeOf(args) }))).el,
  parameters: { gkDocStory: "bounded.box" },
};
