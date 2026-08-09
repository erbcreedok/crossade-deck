import type { Meta, StoryObj } from "@storybook/html";

// A PROSE page: installing the kit and assembling a game with it. See Introduction.stories.ts
// for why a page of text still has a story behind it.
const meta: Meta = {
  title: "Start/Getting Started",
  parameters: { gkDoc: "gettingStarted.page", gkProse: true },
};
export default meta;

export const Page: StoryObj = {
  // `!dev` on the STORY, never on the meta: on the meta it takes the docs entry with it, and
  // the page disappears from the sidebar — the one thing it exists to be. Here it hides only
  // the scaffolding, and the sidebar shows the page under its own name with no child under it.
  tags: ["!dev"],
  render: () => document.createElement("div"),
};
