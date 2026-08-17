import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Draggable,
  freeLayout,
  Grippable,
  grippableBy,
  installStockCarries,
  node,
  rect,
  registerLayout,
  registerSurface,
  rowLayout,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// GRIPPABLE is the permission twin of Private: privacy cuts what a seat SEES, grip cuts what a
// seat may MOVE. It is a fact of the TREE and it cuts a SUBTREE — a hand gripped by "north" makes
// every card in it north's to lift, and a card cannot be freely grabbed out of someone else's
// hand. `by` lists the seats that MAY grip; the default empty list is locked to everyone — a
// fixed board element — and a piece under no grip at all is the open desk, liftable by anyone.
installStockCarries();

const meta: Meta = {
  title: "Atoms/Grippable",
  parameters: {
    gkDoc: "grippable.component",
    gkAtom: "Grippable",
    // The atom's one field, taught by the scene itself: two hands with two different `by` lists,
    // a locked mark with the empty one, and an open card with no atom at all.
    gkFields: { by: ["Hands"] },
  },
};
export default meta;

interface HandsArgs {
  seat: string;
}

export const Hands: StoryObj<HandsArgs> = {
  // TWO HANDS AND YOUR SEAT. Pick `seat` and try dragging: your own hand's cards lift, the other
  // hand's refuse the finger — the grip cuts the SUBTREE, so the cards never carried the atom
  // themselves. The open card in the middle lifts for either seat (no grip, the open desk), and
  // the pale mark refuses both: its `by` is the empty list, a board element locked to everyone.
  render: (a) => {
    registerLayout("story.grip.free", freeLayout);
    registerLayout("story.grip.hand", rowLayout({ gap: 0.15 }));
    registerSurface("story.grip.north", { layers: [{ paint: "accent" }], radius: 0.08 });
    registerSurface("story.grip.south", { layers: [{ paint: "alert" }], radius: 0.08 });
    registerSurface("story.grip.open", { layers: [{ paint: "panelBg" }], radius: 0.08 });
    registerSurface("story.grip.mark", { layers: [{ paint: "sunkBg" }], radius: 0.5 });
    const desk = node("desk", Container({ layout: "story.grip.free" }));
    const hand = (id: string, seat: string, face: string, y: number) => {
      const h = node(
        id,
        Container({ layout: "story.grip.hand" }),
        Transformable({ at: { x: -0.6, y } }),
        Grippable({ by: [seat] }),
      );
      for (let i = 0; i < 3; i++) {
        add(h, node(`${id}.card#${i}`, Bounded({ bounds: rect(0.9, 1.3) }), Surfaced({ surface: face }), Draggable()));
      }
      return h;
    };
    add(desk, hand("northHand", "north", "story.grip.north", -1.3));
    add(desk, hand("southHand", "south", "story.grip.south", 1.3));
    add(
      desk,
      node(
        "openCard",
        Bounded({ bounds: rect(0.9, 1.3) }),
        Surfaced({ surface: "story.grip.open" }),
        Transformable({ at: { x: 2.2, y: 0 } }),
        Draggable(),
      ),
    );
    add(
      desk,
      node(
        "lockedMark",
        Bounded({ bounds: rect(0.7, 0.7) }),
        Surfaced({ surface: "story.grip.mark" }),
        Transformable({ at: { x: -2.6, y: 0 } }),
        Draggable(),
        Grippable({ by: [] }),
      ),
    );
    return wireDrag(scene(desk, { animate: true }), {
      may: (n) => grippableBy(n, a.seat),
    }).el;
  },
  args: { seat: "north" },
  argTypes: {
    seat: documented("arg.seat", { control: "select", options: ["north", "south"] }, "grip"),
  },
  parameters: { gkDocStory: "grippable.hands" },
};
