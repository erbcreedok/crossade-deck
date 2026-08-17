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
    gkFields: { label: ["Caption"] },
  },
};
export default meta;

interface CaptionArgs {
  label: string;
}

export const Caption: StoryObj<CaptionArgs> = {
  // A BUTTON-ON-THE-DESK with its caption as data. The canvas paints NO text — that is the law,
  // not a gap: a string on the glass belongs to the HUD layer, which is not built yet. Where the
  // caption already shows is the catalog's own Node tree panel: open it, select the button, and
  // `label` is there, changing as you type — data on the node, read by whoever draws words.
  render: (a) => {
    registerSurface("story.labeled.button", { layers: [{ paint: "accent" }], radius: 0.2 });
    registerLayout("story.labeled.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.labeled.free" }));
    add(
      desk,
      node(
        "attackButton",
        Bounded({ bounds: rect(1.8, 0.7) }),
        Surfaced({ surface: "story.labeled.button" }),
        Transformable({ at: { x: 0, y: 0 } }),
        Labeled({ label: a.label }),
      ),
    );
    return scene(desk).el;
  },
  args: { label: "Attack" },
  argTypes: {
    label: documented("arg.label", { control: "text" }, "words"),
  },
  parameters: { gkDocStory: "labeled.caption" },
};
