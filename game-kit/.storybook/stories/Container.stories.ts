import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Container, node, Surfaced, Transformable } from "../../src/index.js";
import { scene } from "../devtools/scene.js";

interface ChildrenArgs {
  children: number;
}

const meta: Meta<ChildrenArgs> = {
  title: "Start/Atoms/Container",
  parameters: { gkDoc: "container.component" },
  argTypes: { children: { control: { type: "range", min: 0, max: 6, step: 1 } } },
  args: { children: 3 },
};
export default meta;

/**
 * The children carry the SAME poses in both stories, and the layout is NOT an argument: the two
 * pictures side by side are the lesson, and one control switching between them would hide it.
 */
function table(layout: string, count: number) {
  const poses = [
    { x: -0.9, y: -0.6 },
    { x: 0, y: 0.5 },
    { x: 1.1, y: -0.3 },
    { x: -1.2, y: 0.2 },
    { x: 0.7, y: 0.7 },
    { x: -0.3, y: -0.9 },
  ];
  const root = node("table", Container({ layout }));
  for (let i = 0; i < count; i += 1) {
    add(root, node(`card${i}`, Bounded(), Surfaced(), Transformable({ at: poses[i % poses.length]! })));
  }
  return root;
}

export const Free: StoryObj<ChildrenArgs> = {
  render: ({ children }) => scene(table("free", children)).el,
  parameters: { gkDocStory: "container.free" },
};

export const Row: StoryObj<ChildrenArgs> = {
  render: ({ children }) => scene(table("row", children)).el,
  parameters: { gkDocStory: "container.row" },
};
