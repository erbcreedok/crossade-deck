import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bakeable,
  bakeable,
  Bounded,
  Container,
  node,
  rect,
  registerSurface,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// BAKING — who applies the matrix, the node or the renderer.
//
// The one page of this section with a scene under it, because its claim is the only one here a
// reader cannot check by reading: a difference of one stroke's width, and no amount of prose
// makes it convincing.

interface Args {
  scale: number;
  angle: number;
  policy: Policy;
}

type Policy = "asked" | "all" | "none";

/** The three policies as what they actually are — ordinary predicates, not settings. */
const POLICY: Record<Policy, ((n: Parameters<typeof bakeable>[0]) => boolean) | undefined> = {
  asked: undefined, // no option at all: the kit's own default, which is to ask each node
  all: () => true,
  none: () => false,
};

const DASHED = "story.engine.dashed";

registerSurface(DASHED, {
  layers: [{ paint: "panelBg", opacity: 0.35 }],
  radius: 0.08,
  stroke: { color: "accent", width: 0.03, dash: { on: 0.14, off: 0.09 } },
});

const meta: Meta<Args> = {
  title: "Engine/Baking nodes",
  parameters: {
    gkDoc: "engine.baking",
    gkAtom: "Bakeable",
    // The atom HAS no fields — presence is its whole statement — so there is no field for a
    // control to serve. What the section owes a reader is the difference the atom makes, and
    // the scene below is that: one node carrying it, one not, side by side.
    gkFields: {},
  },
  argTypes: {
    scale: documented("arg.scale", { control: { type: "number", min: 0, step: 0.1 } }),
    angle: documented("arg.angle", { control: { type: "number", step: 15 } }),
    policy: documented("arg.bakePolicy", { control: { type: "inline-radio" }, options: ["asked", "all", "none"] }),
  },
  args: { scale: 2, angle: 0, policy: "asked" },
};
export default meta;

// Left carries `Bakeable`, right does not, and nothing else about them differs — same shape,
// same surface, same pose. At `scale: 1` they are pixel-identical, which is the other half of
// the truth: without a scale there is nothing to choose between them but cost.
//
// `!dev` PUTS IT ON THE PAGE AND NOWHERE ELSE. It keeps everything a story has — the canvas, the
// controls, the node tree, the code panel — while dropping the extra rung in the sidebar. This
// is a section ABOUT the engine, not a gallery of it: a lone scene standing beside `Bounded` in
// the ladder would announce itself as a subject of the same size, and it is a paragraph.
export const Baking: StoryObj<Args> = {
  tags: ["!dev"],
  render: ({ scale, angle, policy }) => {
    const desk = node("desk", Container({ layout: "row" }));
    const pose = { scale, angle };
    const look = { bounds: rect(1, 1.4) };
    add(desk, node("still", Bounded(look), Surfaced({ surface: DASHED }), Transformable(pose), Bakeable()));
    add(desk, node("moving", Bounded(look), Surfaced({ surface: DASHED }), Transformable(pose)));
    const rule = POLICY[policy];
    return scene(desk, rule ? { bake: rule } : {}).el;
  },
  parameters: { gkDocStory: "engine.bakingScene" },
};
