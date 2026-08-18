import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  Labeled,
  node,
  rect,
  registerLayout,
  registerSurface,
  registerTextStyle,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// LABELED carries a caption ALREADY WRITTEN in the viewer's language. The kit paints no string a
// player could read and knows no notion of a language — the caption arrives on the node, and
// whoever draws text (a HUD widget, a tooltip, the catalog's own tree panel) reads it from here.
// That is the whole atom: a store for words the consumer localized before they got in.

const meta: Meta = {
  title: "Atoms/Labeled",
  parameters: {
    gkDoc: "labeled.component",
    gkAtom: "Labeled",
    gkFields: { label: ["Caption"], style: ["style"] },
  },
};
export default meta;

interface CaptionArgs {
  label: string;
  style: string;
}

export const Caption: StoryObj<CaptionArgs> = {
  // A BUTTON-ON-THE-DESK with its caption as data, drawn on the glass. `style` names a ROLE, never
  // a font: a role is what a tree can say and a designer can re-decide, while the family and the
  // size are the theme's answer. Two roles are registered here to make the difference visible, and
  // a name nobody registered falls back to the desk's face rather than throwing — try typing one.
  render: (a) => {
    registerSurface("story.labeled.button", { layers: [{ paint: "accent" }], radius: 0.2 });
    registerTextStyle("story.labeled.plain", { family: "ui-sans-serif, system-ui, sans-serif", size: 0.18, weight: 400, lineHeight: 1.25, fill: "panelBg" });
    registerTextStyle("story.labeled.loud", { family: "ui-serif, Georgia, serif", size: 0.3, weight: 700, lineHeight: 1.2, fill: "panelBg" });
    registerLayout("story.labeled.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.labeled.free" }));
    add(
      desk,
      node(
        "attackButton",
        Bounded({ bounds: rect(1.8, 0.7) }),
        Surfaced({ surface: "story.labeled.button" }),
        Transformable({ at: { x: 0, y: 0 } }),
        Labeled({ label: a.label, style: a.style }),
      ),
    );
    return scene(desk).el;
  },
  args: { label: "Attack", style: "story.labeled.plain" },
  argTypes: {
    label: documented("arg.label", { control: "text" }, "words"),
    style: documented("arg.style", { control: "text" }, "words"),
  },
  parameters: { gkDocStory: "labeled.caption" },
};
