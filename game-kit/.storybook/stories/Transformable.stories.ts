import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Container, node, Surfaced, Transformable } from "../../src/index.js";
import { scene } from "../devtools/scene.js";

interface LiftedArgs {
  x: number;
  y: number;
  z: number;
}

const meta: Meta<LiftedArgs> = {
  title: "Start/Atoms/Transformable",
  parameters: { gkDoc: "transformable.component" },
  argTypes: {
    x: { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } },
    y: { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } },
    // Whole steps: `z` is an order, not a distance. Half a rung above a card means nothing.
    z: { control: { type: "range", min: -2, max: 2, step: 1 } },
  },
  args: { x: 0.2, y: 0.2, z: 1 },
};
export default meta;

export const Lifted: StoryObj<LiftedArgs> = {
  // Two overlapping plates. Take `z` to −1 and the same plate goes UNDER: the pose moved it,
  // the height decided which one you see.
  render: ({ x, y, z }) => {
    const table = node("table", Container({ layout: "free" }));
    add(table, node("under", Bounded(), Surfaced(), Transformable({ at: { x: -0.2, y: -0.2 } })));
    add(table, node("over", Bounded(), Surfaced({ surface: "bare" }), Transformable({ at: { x, y }, z })));
    return scene(table).el;
  },
  parameters: { gkDocStory: "transformable.lifted" },
};
