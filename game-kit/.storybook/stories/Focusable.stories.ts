import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
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
import { documented } from "./surfaceControls.js";

// FOCUSABLE is a MARKER, like Placeable: presence says "input focus may land here", absence
// declines, and no second field can disagree. It requires `Bounded` — focus lands on something
// with a footprint to outline. What focus LOOKS like is not the atom's business: a consumer
// wears a coat on the focused node (a ring is the stock recipe for exactly this), and which node
// HOLDS focus is runtime state the input wiring keeps — never a field on the element.
installStockCoats();

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
  focused: boolean;
}

export const Focus: StoryObj<FocusArgs> = {
  // TWO TOKENS AND A TAB KEY'S WORTH OF STATE. The left token is `Focusable`; flip `focused` —
  // the input wiring's runtime state — and the story wears a stock ring coat on it, exactly as a
  // game would on Tab. The right token never rings, whatever the state says: it never declared
  // the capability, and `focusable()` is the gate the wiring asks before it moves focus at all.
  render: (a) => {
    registerSurface("story.focus.token", { layers: [{ paint: "panelBg" }], radius: 0.14 });
    registerLayout("story.focus.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.focus.free" }));
    const field = node(
      "nameField",
      Bounded({ bounds: rect(1.8, 0.7) }),
      Surfaced({ surface: "story.focus.token" }),
      Transformable({ at: { x: 0, y: -0.7 } }),
      Focusable(),
    );
    if (a.focused && focusable(field)) {
      field.atoms.set("Coated", Coated({ self: { recipe: "ring", level: 0.8, tint: "accent" }, cast: { recipe: "", level: 0, tint: "" } }));
    }
    add(desk, field);
    add(
      desk,
      node(
        "decorativeBar",
        Bounded({ bounds: rect(1.8, 0.7) }),
        Surfaced({ surface: "story.focus.token" }),
        Transformable({ at: { x: 0, y: 0.7 } }),
      ),
    );
    return scene(desk).el;
  },
  args: { focused: true },
  argTypes: {
    focused: documented("arg.focused", { control: "boolean" }, "focus"),
  },
  parameters: { gkDocStory: "focusable.focus" },
};
