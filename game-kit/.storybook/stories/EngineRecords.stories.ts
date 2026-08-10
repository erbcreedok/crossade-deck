import type { Meta, StoryObj } from "@storybook/html";

// PRESETS AND RECORDS — the three ways the kit hands you something ready-made, and how to add your own.
const meta: Meta = {
  title: "Engine/Presets and records",
  parameters: { gkDoc: "engine.records", gkProse: true },
};
export default meta;

export const Page: StoryObj = {
  tags: ["!dev"],
  render: () => document.createElement("div"),
};
