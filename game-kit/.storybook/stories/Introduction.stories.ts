import type { Meta, StoryObj } from "@storybook/html";

// A PROSE page: what the kit is, before anything is built with it.
//
// It still exports a story, because a docs entry with no story does not exist as far as
// Storybook is concerned. `!dev` keeps that scaffolding out of the sidebar, and `gkProse`
// keeps it off the page — otherwise the reader would meet an empty canvas under the text.
const meta: Meta = {
  title: "Start/Introduction",
  parameters: { gkDoc: "intro.page", gkProse: true },
};
export default meta;

export const Page: StoryObj = {
  // `!dev` on the STORY, never on the meta: on the meta it takes the docs entry with it, and
  // the page disappears from the sidebar — the one thing it exists to be. Here it hides only
  // the scaffolding, and the sidebar shows the page under its own name with no child under it.
  tags: ["!dev"],
  render: () => document.createElement("div"),
};
