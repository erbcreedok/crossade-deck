import type { Meta, StoryObj } from "@storybook/html";

// THE ENGINE SECTION'S FRONT DOOR — what the thing is, and where each part of it is explained.
//
// The section is EXPLANATION, and that is a genre with its own audience: whoever works on the
// kit itself. A game is assembled without reading a word of it. Keeping the four genres apart
// is the point — a page that teaches, instructs, states facts and explains at once serves none
// of the four readers, and this catalog had exactly one genre in it before the split.
const meta: Meta = {
  title: "Engine/Overview",
  parameters: { gkDoc: "engine.overview", gkProse: true },
};
export default meta;

export const Page: StoryObj = {
  // `!dev` on the STORY, never on the meta: on the meta it takes the docs entry with it, and
  // the page disappears from the sidebar — the one thing it exists to be.
  tags: ["!dev"],
  render: () => document.createElement("div"),
};
