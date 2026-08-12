import type { Meta, StoryObj } from "@storybook/html";
import { Bounded, Coated, installStockCoats, node, rect, Surfaced } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// PRESETS THAT MIX A RUNTIME COAT — one page per stock recipe, in isolation, with only its own knobs.
//
// The recipes are DATA the kit ships; `Atoms/Coated` teaches the atom and the reach, this shelf
// answers the narrower question a gamedev has — "what does the `wash`/`ring`/`censor` name already
// look like, and what does its `level` do". So the controls are the coat's own, never a whole tree.
// `clear` is not a page: it draws nothing on purpose (it stops a cast cascade), and a blank canvas
// teaches nothing a paragraph cannot.
installStockCoats();

interface CoatArgs {
  level: number;
  tint: string;
}

const levelControl = documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "self");
const tintControl = documented("arg.coatTint", { control: "select", options: ["", ...PAINTS] }, "self");

const box = (surface: string, recipe: string, a: CoatArgs) =>
  scene(
    node(
      "coatedTile",
      Bounded({ bounds: rect(1.6, 1.6) }),
      Surfaced({ surface }),
      Coated({ self: { recipe, level: a.level, tint: a.tint } }),
    ),
  ).el;

const meta: Meta = {
  title: "Presets/Coats",
  parameters: { gkDoc: "presetsCoats.component" },
};
export default meta;

export const Wash: StoryObj<CoatArgs> = {
  // A flat colour over the surface, opacity from `level`. The continuum — a charge, a dim, an HP
  // fade — is one recipe; drag `level` and pick a `tint`, there is no scene per value.
  render: (a) => box("plate", "wash", a),
  args: { level: 0.6, tint: "accent" },
  argTypes: { level: levelControl, tint: tintControl },
  parameters: { gkDocStory: "presetsCoats.wash" },
};

export const Ring: StoryObj<CoatArgs> = {
  // A stroke around the contour, its weight from `level` — a selection ring, a ward. It replaces the
  // surface's own border while it lasts, one stroke per quad.
  render: (a) => box("plate", "ring", a),
  args: { level: 0.6, tint: "accent" },
  argTypes: { level: levelControl, tint: tintControl },
  parameters: { gkDocStory: "presetsCoats.ring" },
};

export const Censor: StoryObj<CoatArgs> = {
  // A mask over the surface AND a shader that animates it. The wash masks with no GPU at all; on the
  // glass a named `blur` shimmers over it, built and clocked by the painter. Drag `level`: both thicken.
  render: (a) => box("plate", "censor", a),
  args: { level: 0.7, tint: "" },
  argTypes: { level: levelControl, tint: tintControl },
  parameters: { gkDocStory: "presetsCoats.censor" },
};
