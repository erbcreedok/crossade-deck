import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Container, node, Surfaced, Transformable } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

interface ChildrenArgs {
  children: number;
}

const meta: Meta<ChildrenArgs> = {
  title: "Atoms/Container",
  parameters: {
    gkDoc: "container.component",
    gkAtom: "Container",
    // A field may be served by SCENES instead of a control, and this one is: the two pictures
    // side by side ARE the lesson, and one dropdown switching between them would hide it. The
    // guard accepts either, so long as the field is reachable from the catalog at all.
    gkFields: { layout: ["Free", "Row"] },
  },
  argTypes: { children: documented("arg.children", { control: { type: "range", min: 0, max: 6, step: 1 } }) },
  args: { children: 3 },
};
export default meta;

/**
 * The children carry the SAME poses in both stories, and the layout is NOT an argument: the two
 * pictures side by side are the lesson, and one control switching between them would hide it.
 */
function desk(layout: string, count: number) {
  const poses = [
    { x: -0.9, y: -0.6 },
    { x: 0, y: 0.5 },
    { x: 1.1, y: -0.3 },
    { x: -1.2, y: 0.2 },
    { x: 0.7, y: 0.7 },
    { x: -0.3, y: -0.9 },
  ];
  const root = node("desk", Container({ layout }));
  for (let i = 0; i < count; i += 1) {
    add(root, node(`card${i}`, Bounded(), Surfaced(), Transformable({ at: poses[i % poses.length]! })));
  }
  return root;
}

export const Free: StoryObj<ChildrenArgs> = {
  render: ({ children }) => scene(desk("free", children)).el,
  parameters: { gkDocStory: "container.free" },
};

export const Row: StoryObj<ChildrenArgs> = {
  render: ({ children }) => scene(desk("row", children)).el,
  parameters: { gkDocStory: "container.row" },
};
