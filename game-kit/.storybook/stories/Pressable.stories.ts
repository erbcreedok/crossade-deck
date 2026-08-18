import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  node,
  Pressable,
  rect,
  registerLayout,
  registerSurface,
  registerTextStyle,
  Labeled,
  Surfaced,
  Transformable,
  Valued,
  type Coat,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// PRESSABLE says an element answers a finger, and declares what it WEARS while one is near it. It
// is the look and the depth, never the meaning: what a press DOES is `Valued`, read by whoever
// handles it — the same split `Inviting` keeps between the coat and the zone's legality.

const meta: Meta = {
  title: "Atoms/Pressable",
  parameters: {
    gkDoc: "pressable.component",
    gkAtom: "Pressable",
    gkFields: { hover: ["Control"], held: ["Control"], sink: ["Control"], nudge: ["Control"] },
  },
};
export default meta;

interface ControlArgs {
  hoverRecipe: string;
  hoverLevel: number;
  heldRecipe: string;
  heldLevel: number;
  sink: number;
  nudgeX: number;
  nudgeY: number;
}

const coat = (recipe: string, level: number, tint: string): Coat => ({ recipe, level, tint });

export const Control: StoryObj<ControlArgs> = {
  // Three controls, the same assembly. Move the pointer over one to see `hover`, hold it to see
  // `held`, `sink` and `nudge` at once. The third declares no `Valued` — it lights and sinks and
  // reports nothing, which is a legitimate control: a spacer that still feels alive under a finger.
  render: (a) => {
    registerSurface("story.press.plate", { layers: [{ paint: "panelBg" }], radius: 0.1, stroke: { color: "panelBorder", width: 0.02 } });
    registerTextStyle("story.press.label", { family: "ui-sans-serif, system-ui, sans-serif", size: 0.2, weight: 500, lineHeight: 1.2, fill: "text" });
    registerLayout("story.press.row", freeLayout);
    const desk = node("desk", Container({ layout: "story.press.row" }));
    const control = (id: string, x: number, label: string, means?: Record<string, unknown>) =>
      node(
        id,
        Bounded({ bounds: rect(1.7, 0.66) }),
        Surfaced({ surface: "story.press.plate" }),
        Labeled({ label, style: "story.press.label" }),
        Transformable({ at: { x, y: 0 } }),
        Pressable({
          hover: coat(a.hoverRecipe, a.hoverLevel, "text"),
          held: coat(a.heldRecipe, a.heldLevel, "shadow"),
          sink: a.sink,
          nudge: { x: a.nudgeX, y: a.nudgeY },
        }),
        ...(means ? [Valued({ values: means })] : []),
      );
    add(desk, control("undo", -1.9, "Undo", { does: "undo" }));
    add(desk, control("hint", 0, "Hint", { does: "hint" }));
    add(desk, control("mute", 1.9, "Says nothing"));
    return scene(desk, { press: () => undefined }).el;
  },
  args: { hoverRecipe: "wash", hoverLevel: 0.12, heldRecipe: "wash", heldLevel: 0.22, sink: -0.6, nudgeX: 0.04, nudgeY: 0.04 },
  argTypes: {
    hoverRecipe: documented("arg.hover", { control: "text" }, "hover"),
    hoverLevel: documented("arg.hover", { control: { type: "range", min: 0, max: 1, step: 0.02 } }, "hover"),
    heldRecipe: documented("arg.held", { control: "text" }, "held"),
    heldLevel: documented("arg.held", { control: { type: "range", min: 0, max: 1, step: 0.02 } }, "held"),
    sink: documented("arg.sink", { control: { type: "range", min: -2, max: 0, step: 0.1 } }, "depth"),
    nudgeX: documented("arg.nudge", { control: { type: "number", step: 0.01 } }, "nudge"),
    nudgeY: documented("arg.nudge", { control: { type: "number", step: 0.01 } }, "nudge"),
  },
  parameters: { gkDocStory: "pressable.control" },
};
