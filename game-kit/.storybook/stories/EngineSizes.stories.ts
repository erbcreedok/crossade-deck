import type { Meta, StoryObj } from "@storybook/html";

// SIZES — units, and the one place they become pixels.
const meta: Meta = {
  title: "Engine/Sizes",
  parameters: { gkDoc: "engine.sizes", gkProse: true },
};
export default meta;

export const Page: StoryObj = {
  tags: ["!dev"],
  render: () => document.createElement("div"),
};
