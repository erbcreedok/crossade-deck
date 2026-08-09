import type { Meta, StoryObj } from "@storybook/html";
import { add, node } from "../../src/index.js";
import { scene } from "../devtools/scene.js";

const meta: Meta = {
  title: "Basics/Root",
  parameters: { gkDoc: "root.component" },
};
export default meta;

interface TreeArgs {
  /** The root's own name. Named like everything else — a root is an ordinary node. */
  id: string;
  /** One entry per child, in tree order. The row is add/remove — a child is a THING. */
  children: string[];
}

/**
 * The names actually worth adding: blanks are somebody mid-typing, and a repeat — of a sibling
 * or of the root itself — would throw in `add`. That rule is worth keeping and not worth
 * killing the scene between two keystrokes of `hand` typed under `hands`.
 *
 * Deliberately OUTSIDE the story: the snippet under the canvas is the story's own text, and it
 * should read as a game being built, not as a catalog defending itself against a half-typed
 * field.
 */
function childNames(id: string, children: string[]): string[] {
  return [...new Set(children.map((c) => c.trim()).filter(Boolean))].filter((n) => n !== id);
}

export const WithChildren: StoryObj<TreeArgs> = {
  // A LIST for the children, not a comma-separated line. Adding a child is one act — press
  // add, name it — and a text field turns that into punctuation the reader has to get right,
  // with every neighbour's name inside the same box. The names are authored (they come from
  // the spec, not a generator), so each one gets a field of its own.
  argTypes: { id: { control: "text" }, children: { control: "object" } },
  args: { id: "root", children: ["hand", "discard"] },
  render: ({ id, children }) => {
    const root = node(id.trim() || "root");
    for (const name of childNames(root.id, children)) add(root, node(name));
    return scene(root).el;
  },
  parameters: { gkDocStory: "root.withChildren" },
};

export const Alone: StoryObj<Pick<TreeArgs, "id">> = {
  argTypes: { id: { control: "text" } },
  args: { id: "root" },
  render: ({ id }) => scene(node(id.trim() || "root")).el,
  parameters: { gkDocStory: "root.alone" },
};
