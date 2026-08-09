import type { Meta, StoryObj } from "@storybook/html";

// THE CHAIN — a canvas rather than HTML, and the three parts that turn a tree into pixels.
const meta: Meta = {
  title: "Engine/The chain",
  parameters: { gkDoc: "engine.chain", gkProse: true },
};
export default meta;

export const Page: StoryObj = {
  tags: ["!dev"],
  render: () => document.createElement("div"),
};
