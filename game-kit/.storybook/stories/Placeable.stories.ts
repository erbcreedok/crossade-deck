import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  node,
  Placeable,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";

// PLACEABLE is a MARKER: presence says "this can be set into a slot", absence declines — there
// is no second field to disagree with it. It requires `Bounded`, because a thing set into a slot
// needs a footprint the slot can seat. What reads it is the move machinery (`planMove` and the
// slot layouts); what it never does is draw, which is why this scene teaches by contrast and by
// the debug outline rather than by paint.

const meta: Meta = {
  title: "Atoms/Placeable",
  parameters: {
    gkDoc: "placeable.component",
    gkAtom: "Placeable",
    // The atom has NO fields — presence is the whole answer, and the two tokens side by side
    // are the control: one carries the marker, one does not.
    gkFields: {},
  },
};
export default meta;

export const Marker: StoryObj = {
  // TWO IDENTICAL TOKENS, one difference a renderer cannot show: the left one is `Placeable`,
  // the right one is not. Nothing on the glass differs — the marker draws nothing — and that is
  // the lesson: what changes is the ANSWER the move machinery gets when it asks whether a slot
  // may seat this. Open the Node tree panel to see the capability on the left token.
  render: () => {
    registerSurface("story.placeable.token", { layers: [{ paint: "accent" }], radius: 0.5 });
    registerLayout("story.placeable.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.placeable.free" }));
    add(
      desk,
      node(
        "seatable",
        Bounded({ bounds: rect(0.9, 0.9) }),
        Surfaced({ surface: "story.placeable.token" }),
        Transformable({ at: { x: -0.9, y: 0 } }),
        Placeable(),
      ),
    );
    add(
      desk,
      node(
        "loose",
        Bounded({ bounds: rect(0.9, 0.9) }),
        Surfaced({ surface: "story.placeable.token" }),
        Transformable({ at: { x: 0.9, y: 0 } }),
      ),
    );
    return scene(desk).el;
  },
  parameters: { gkDocStory: "placeable.marker" },
};
