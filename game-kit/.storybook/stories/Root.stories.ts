import type { Meta, StoryObj } from "@storybook/html";
import { add, node } from "../../src/index.js";
import { scene } from "../devtools/scene.js";

const meta: Meta = {
  title: "Start/Basics/Root",
  parameters: { gkDoc: "root.component" },
};
export default meta;

export const WithChildren: StoryObj = {
  render: () => {
    // Authored names, straight from the spec: every device loading this board reads the same
    // three, which is what makes them agree on which node a move is about.
    const root = node("table");
    add(root, node("hand"));
    add(root, node("discard"));
    return scene(root).el;
  },
  parameters: { gkDocStory: "root.withChildren" },
};

export const Alone: StoryObj = {
  render: () => scene(node("table")).el,
  parameters: { gkDocStory: "root.alone" },
};
