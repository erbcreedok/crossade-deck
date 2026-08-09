import type { Meta, StoryObj } from "@storybook/html";
import { node } from "../../src/index.js";
import { scene } from "../devtools/scene.js";

interface BareArgs {
  id: string;
}

// Prose is a KEY (`gkDoc`), resolved at render time from `locales/*.json` — see DocsPage.
const meta: Meta<BareArgs> = {
  title: "Basics/Node",
  parameters: { gkDoc: "node.component" },
  // The ONLY field a bare node has, and the one this page is about: a node is NAMED, it does
  // not name itself. Type a name and watch the inspector follow — that is the whole claim,
  // made operable instead of merely asserted in prose.
  argTypes: { id: { control: "text" } },
  args: { id: "root" },
};
export default meta;

export const Bare: StoryObj<BareArgs> = {
  // An empty box is a reader mid-edit, not a request for a node with no name. Naming is the
  // one thing this scene is about, so it must never be left without one.
  render: ({ id }) => scene(node(id.trim() || "root")).el,
  parameters: { gkDocStory: "node.bare" },
};
