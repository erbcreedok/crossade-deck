import type { Meta, StoryObj } from "@storybook/html";
import {
  Acceptor,
  add,
  Bounded,
  Container,
  Draggable,
  freeLayout,
  installStockCarries,
  installStockCoats,
  Inviting,
  node,
  Owned,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// OWNED names the BOX an element came from — the reference `reconcile` and "return the strays"
// read, and the field a rule reaches as `el.box`. The atom stores a name and never interprets
// it; this scene lets two return-slots judge it, each taking only its own deck's cards, through
// the same invite every willing zone wears.
installStockCoats();
installStockCarries();

const meta: Meta = {
  title: "Atoms/Owned",
  parameters: {
    gkDoc: "owned.component",
    gkAtom: "Owned",
    gkFields: { box: ["Box"] },
  },
};
export default meta;

interface BoxArgs {
  box: string;
}

export const Box: StoryObj<BoxArgs> = {
  // ONE CARD, TWO RETURN-SLOTS. Each slot takes only cards of its own box — `el.box` in the
  // rule reads this very atom. Flip `box` and drag: the matching slot lights, the other stays
  // dark. Nothing else changed about the card: the box is a name it carries, not where it sits.
  render: (a) => {
    registerSurface("story.owned.zone", { layers: [{ paint: "sunkBg" }], radius: 0.12 });
    registerSurface("story.owned.card", { layers: [{ paint: "accent" }], radius: 0.08 });
    registerLayout("story.owned.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.owned.free" }));
    for (const [i, box] of (["redDeck", "blueDeck"] as const).entries()) {
      add(
        desk,
        node(
          `${box}Slot`,
          Bounded({ bounds: rect(1.4, 1.8) }),
          Container({ layout: "story.owned.free" }),
          Surfaced({ surface: "story.owned.zone" }),
          Transformable({ at: { x: 1.3, y: -1.1 + i * 2.2 } }),
          Acceptor({ accept: { eq: ["el.box", box] } }),
          Inviting({ coat: { recipe: "wash", level: 0.4, tint: "accent" } }),
        ),
      );
    }
    add(
      desk,
      node(
        "card",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.owned.card" }),
        Transformable({ at: { x: -1.5, y: 0 } }),
        Owned({ box: a.box }),
        Draggable(),
      ),
    );
    return wireDrag(scene(desk, { animate: true })).el;
  },
  args: { box: "redDeck" },
  argTypes: {
    box: documented("arg.box", { control: "select", options: ["redDeck", "blueDeck"] }, "values"),
  },
  parameters: { gkDocStory: "owned.box" },
};
