import type { Meta, StoryObj } from "@storybook/html";

// INHERITANCE — what a node gets that it did not author, and by which of five rules.
//
// Named for the question rather than the mechanism: "Resolution" reads as screen resolution on
// a page that is full of pixels, and "along the chain" is already the title next door.
const meta: Meta = {
  title: "Engine/Inheritance",
  parameters: { gkDoc: "engine.inheritance", gkProse: true },
};
export default meta;

export const Page: StoryObj = {
  tags: ["!dev"],
  render: () => document.createElement("div"),
};
