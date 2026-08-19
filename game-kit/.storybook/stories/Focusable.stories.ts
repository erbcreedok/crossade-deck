import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  coatNames,
  Coated,
  Container,
  focusable,
  Focusable,
  freeLayout,
  installStockCoats,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// FOCUSABLE is a MARKER, like Placeable: presence says "input focus may land here", absence
// declines, and no second field can disagree. It requires `Bounded` — focus lands on something
// with a footprint to outline. What focus LOOKS like is not the atom's business: a consumer
// wears a coat on the focused node (a ring is the stock recipe for exactly this), and which node
// HOLDS focus is runtime state the input wiring keeps — never a field on the element.
installStockCoats();

const RECIPES = ["", ...coatNames()];

const meta: Meta = {
  title: "Atoms/Focusable",
  parameters: {
    gkDoc: "focusable.component",
    gkAtom: "Focusable",
    // No fields — presence is the whole statement, and the two tokens side by side are the
    // control: one carries the marker, one does not.
    gkFields: {},
  },
};
export default meta;

interface FocusArgs {
  fill: string;
  radius: number;
  fieldW: number;
  fieldH: number;
  fieldX: number;
  fieldY: number;
  focused: boolean;
  ringRecipe: string;
  ringLevel: number;
  ringTint: string;
  barW: number;
  barH: number;
  barX: number;
  barY: number;
}

export const Focus: StoryObj<FocusArgs> = {
  // TWO TOKENS AND A TAB KEY'S WORTH OF STATE. The left token is `Focusable`; flip `focused` —
  // the input wiring's runtime state — and the story wears a stock ring coat on it, exactly as a
  // game would on Tab. The right token never rings, whatever the state says: it never declared
  // the capability, and `focusable()` is the gate the wiring asks before it moves focus at all.
  render: ({ fill, radius, fieldW, fieldH, fieldX, fieldY, focused, ringRecipe, ringLevel, ringTint, barW, barH, barX, barY }) => {
    registerSurface("story.focus.token", { layers: [{ paint: fill }], radius });
    registerLayout("story.focus.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.focus.free" }));
    const field = node(
      "nameField",
      Bounded({ bounds: rect(fieldW, fieldH) }),
      Surfaced({ surface: "story.focus.token" }),
      Transformable({ at: { x: fieldX, y: fieldY } }),
      Focusable(),
    );
    if (focused && focusable(field)) {
      field.atoms.set(
        "Coated",
        Coated({ self: { recipe: ringRecipe, level: ringLevel, tint: ringTint }, cast: { recipe: "", level: 0, tint: "" } }),
      );
    }
    add(desk, field);
    add(
      desk,
      node(
        "decorativeBar",
        Bounded({ bounds: rect(barW, barH) }),
        Surfaced({ surface: "story.focus.token" }),
        Transformable({ at: { x: barX, y: barY } }),
      ),
    );
    return scene(desk).el;
  },
  args: {
    fill: "panelBg",
    radius: 0.14,
    fieldW: 1.8,
    fieldH: 0.7,
    fieldX: 0,
    fieldY: -0.7,
    focused: true,
    ringRecipe: "ring",
    ringLevel: 0.8,
    ringTint: "accent",
    barW: 1.8,
    barH: 0.7,
    barX: 0,
    barY: 0.7,
  },
  argTypes: {
    // The record both tokens wear — one registration, so the pair stays identical but for the ring.
    fill: documented("arg.fill", { control: "select", options: PAINTS }, "token surface"),
    radius: documented("arg.radius", { control: { type: "number", min: 0, step: 0.02 } }, "token surface"),
    fieldW: documented("arg.w", { control: { type: "number", min: 0, step: 0.1 } }, "nameField/bounds"),
    fieldH: documented("arg.h", { control: { type: "number", min: 0, step: 0.1 } }, "nameField/bounds"),
    fieldX: documented("arg.x", { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } }, "nameField/transformable"),
    fieldY: documented("arg.y", { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } }, "nameField/transformable"),
    focused: documented("arg.focused", { control: "boolean" }, "nameField/focus"),
    // The coat is what focus LOOKS like, and it is worn only while focus stands here.
    ringRecipe: documented("arg.coatRecipe", { control: "select", options: RECIPES, if: { arg: "focused", truthy: true } }, "nameField/coated"),
    ringLevel: documented(
      "arg.coatLevel",
      { control: { type: "range", min: 0, max: 1, step: 0.05 }, if: { arg: "focused", truthy: true } },
      "nameField/coated",
    ),
    ringTint: documented(
      "arg.coatTint",
      { control: "select", options: ["", ...PAINTS], if: { arg: "focused", truthy: true } },
      "nameField/coated",
    ),
    barW: documented("arg.w", { control: { type: "number", min: 0, step: 0.1 } }, "decorativeBar/bounds"),
    barH: documented("arg.h", { control: { type: "number", min: 0, step: 0.1 } }, "decorativeBar/bounds"),
    barX: documented("arg.x", { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } }, "decorativeBar/transformable"),
    barY: documented("arg.y", { control: { type: "range", min: -1.5, max: 1.5, step: 0.05 } }, "decorativeBar/transformable"),
  },
  parameters: { gkDocStory: "focusable.focus" },
};
