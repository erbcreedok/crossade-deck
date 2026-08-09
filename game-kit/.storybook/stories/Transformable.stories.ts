import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Container, node, Surfaced, Transformable } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

interface LiftedArgs {
  x: number;
  y: number;
  z: number;
  angle: number;
  scale: number;
}

const meta: Meta<LiftedArgs> = {
  title: "Atoms/Transformable",
  parameters: {
    gkDoc: "transformable.component",
    gkAtom: "Transformable",
    gkFields: { at: ["x", "y"], z: ["z"], angle: ["angle"], scale: ["scale"] },
  },
  argTypes: {
    x: documented("arg.x", { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } }),
    y: documented("arg.y", { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } }),
    // Whole steps: `z` is an order, not a distance. Half a rung above a card means nothing.
    z: documented("arg.z", { control: { type: "range", min: -2, max: 2, step: 1 } }),
    // Fifteen at a time, because that is how anyone actually turns a card: by a notch, not to
    // 37.4 degrees.
    angle: documented("arg.angle", { control: { type: "number", step: 15 } }),
    scale: documented("arg.scale", { control: { type: "number", min: 0, step: 0.1 } }),
  },
  args: { x: 0.2, y: 0.2, z: 1, angle: 0, scale: 1 },
};
export default meta;

export const Lifted: StoryObj<LiftedArgs> = {
  // Two overlapping plates. Take `z` to −1 and the same plate goes UNDER: the pose moved it,
  // the height decided which one you see.
  render: ({ x, y, z, angle, scale }) => {
    const desk = node("desk", Container({ layout: "free" }));
    add(desk, node("under", Bounded(), Surfaced(), Transformable({ at: { x: -0.2, y: -0.2 } })));
    add(desk, node("over", Bounded(), Surfaced({ surface: "bare" }), Transformable({ at: { x, y }, z, angle, scale })));
    return scene(desk).el;
  },
  parameters: { gkDocStory: "transformable.lifted" },
};
