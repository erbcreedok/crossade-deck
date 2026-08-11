import type { Meta, StoryObj } from "@storybook/html";
import { Bounded, Flippable, node, rect, registerSurface, shownFace, Surfaced } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// FLIPPABLE draws nothing on its own — it ANSWERS which face shows, and the answer is data. So the
// scene wires that answer to the glass itself: the front and the back are two registered surfaces,
// and what the card actually wears is `shownFace(card, faceUp).surface`. Flip `faceUp` and the paint
// changes, because the resolver chose the other name — the whole atom, seen without a renderer that
// knows anything about turning.
//
// The four reverses are the point. `back` shows the other surface (a deck back); `alt` shows it too
// but means a per-card second face; `same` shows the front either way (a token identical both sides);
// `mirror` keeps the FRONT and only reflects it — a reflection this stand cannot paint (the painter
// has no axis-mirror), so `mirror` reads as the front here, which is exactly its surface. The doc
// says so rather than the scene faking a flip it cannot do.

const meta: Meta = {
  title: "Atoms/Flippable",
  parameters: {
    gkDoc: "flippable.component",
    gkAtom: "Flippable",
    // Every field of the atom, and the control that reaches it. `back` is reached through the back
    // colour: the field holds a surface name, and this control is what that surface looks like.
    gkFields: { reverse: ["reverse"], axis: ["axis"], back: ["back"] },
  },
};
export default meta;

interface TurnArgs {
  id: string;
  faceUp: boolean;
  reverse: "back" | "same" | "mirror" | "alt";
  axis: "x" | "y";
  front: string;
  back: string;
}

export const Turn: StoryObj<TurnArgs> = {
  // ONE CARD, and a switch that turns it. The front and back are the two colours; the reverse says
  // how the down-side relates to the up-side. Everything the renderer is told is `shownFace`'s
  // answer — there is no second code path for «the card is face-down».
  render: (a) => {
    registerSurface("story.flip.front", { layers: [{ paint: a.front }], radius: 0.08 });
    registerSurface("story.flip.back", { layers: [{ paint: a.back }], radius: 0.08 });
    const card = node(
      a.id.trim() || "card",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: "story.flip.front" }),
      Flippable({ reverse: a.reverse, axis: a.axis, back: "story.flip.back" }),
    );
    const face = shownFace(card, a.faceUp);
    return scene(
      node(
        a.id.trim() || "card",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: face?.surface ?? "story.flip.front" }),
      ),
    ).el;
  },
  // Colours are TOKEN names, never literals — a token follows the theme and crosses the wire; a
  // pasted hex does neither, and `guard.no-raw-colour` keeps every one of them out of this file.
  args: { id: "card", faceUp: true, reverse: "back", axis: "y", front: "panelBg", back: "accent" },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    faceUp: documented("arg.faceUp", { control: "boolean" }),
    reverse: documented("arg.reverse", { control: "select", options: ["back", "same", "mirror", "alt"] }, "flip"),
    axis: documented("arg.axis", { control: "inline-radio", options: ["x", "y"] }, "flip"),
    front: documented("arg.front", { control: "select", options: PAINTS }, "flip"),
    back: documented("arg.back", { control: "select", options: PAINTS }, "flip"),
  },
  parameters: { gkDocStory: "flippable.turn" },
};
