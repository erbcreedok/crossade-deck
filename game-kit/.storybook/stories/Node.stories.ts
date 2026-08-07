import type { Meta, StoryObj } from "@storybook/html";
import { node } from "../../src/index.js";
import { scene } from "../devtools/scene.js";

// Prose is a KEY (`gkDoc`), resolved at render time from `locales/*.json` — see DocsPage.
const meta: Meta = {
  title: "Start/Basics/Node",
  parameters: { gkDoc: "node.component" },
};
export default meta;

export const Bare: StoryObj = {
  render: () => scene(node("table")).el,
  parameters: { gkDocStory: "node.bare" },
};
