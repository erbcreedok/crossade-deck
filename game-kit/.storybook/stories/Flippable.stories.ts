import type { Meta, StoryObj } from "@storybook/html";
import { Bounded, Flippable, node, rect, registerSurface, shownSurface, Surfaced } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// FLIPPABLE draws nothing on its own — it ANSWERS which surface shows, and the answer is data. So the
// scene wires that answer to the glass itself: the front and the back are two registered surfaces,
// and what the card actually wears is `shownSurface(card, faceUp)`. Flip `faceUp` and the paint
// changes, because the resolver chose the other name — the whole atom, seen without a renderer that
// knows anything about turning.
//
// One field, `back`: the down-side surface. Empty it and the turn shows the front — a token identical
// both sides, and never a card that turns up blank.

const meta: Meta = {
  title: "Atoms/Flippable",
  parameters: {
    gkDoc: "flippable.component",
    gkAtom: "Flippable",
    // The atom's one field, and the control that reaches it: the back is a surface, and this control
    // is which surface that is.
    gkFields: { back: ["back"] },
  },
};
export default meta;

interface TurnArgs {
  id: string;
  faceUp: boolean;
  front: string;
  back: string;
}

export const Turn: StoryObj<TurnArgs> = {
  // ONE CARD, and a switch that turns it. The front and the back are the two surfaces; face-down
  // wears the back. Everything the renderer is told is `shownSurface`'s answer — there is no second
  // code path for «the card is face-down».
  render: (a) => {
    registerSurface("story.flip.front", { layers: [{ paint: a.front }], radius: 0.08 });
    registerSurface("story.flip.back", { layers: [{ paint: a.back }], radius: 0.08 });
    const card = node(
      a.id.trim() || "card",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: "story.flip.front" }),
      Flippable({ back: "story.flip.back" }),
    );
    return scene(
      node(
        a.id.trim() || "card",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: shownSurface(card, a.faceUp) ?? "story.flip.front" }),
      ),
    ).el;
  },
  // Colours are TOKEN names, never literals — a token follows the theme and crosses the wire; a
  // pasted hex does neither, and `guard.no-raw-colour` keeps every one of them out of this file.
  args: { id: "card", faceUp: true, front: "panelBg", back: "accent" },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    faceUp: documented("arg.faceUp", { control: "boolean" }),
    front: documented("arg.front", { control: "select", options: PAINTS }, "flip"),
    back: documented("arg.back", { control: "select", options: PAINTS }, "flip"),
  },
  parameters: { gkDocStory: "flippable.turn" },
};
