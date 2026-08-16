import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  node,
  Private,
  rect,
  registerLayout,
  registerSurface,
  remove,
  rowLayout,
  Surfaced,
  Transformable,
  visibleTo,
  walk,
  type Node,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// PRIVATE cuts a SUBTREE out of what a viewer is SHOWN — the visibility twin of Grippable's
// permission. `access` lists the viewpoints that may see; the empty list is hidden from everyone,
// and a hand names its owner to open it to exactly one. Privacy is a fact of the TREE, never of
// the renderer: the view is LOCAL, so what changes is only the PROJECTION a seat is handed — the
// truth is never written. The projection itself is the consumer's one line: walk the tree and
// drop what `visibleTo` denies, exactly what `projected()` below does before mounting.

const meta: Meta = {
  title: "Atoms/Private",
  parameters: {
    gkDoc: "private.component",
    gkAtom: "Private",
    // The atom's one field, taught by the scene: two hands with two access lists, a pile with
    // none, and the seat control that swaps the whole projection.
    gkFields: { access: ["Hands"] },
  },
};
export default meta;

/** The seat's view of a tree: every subtree its eyes are denied is simply not there. */
function projected(root: Node, seat: string): Node {
  const hidden: Node[] = [];
  walk(root, (n) => {
    if (!visibleTo(n, seat)) hidden.push(n);
  });
  for (const n of hidden) if (n.parent) remove(n.parent, n);
  return root;
}

interface HandsArgs {
  seat: string;
}

export const Hands: StoryObj<HandsArgs> = {
  // TWO PRIVATE HANDS AND YOUR EYES. Pick `seat`: your own hand's cards are on the desk, the
  // other hand is simply NOT THERE — the cut takes the subtree, so its cards never needed an
  // atom of their own. The middle pile carries no `Private` and shows for everyone. Whether the
  // other seat sees nothing (this scene) or face-down backs is the GAME's choice — a projection
  // may swap faces before it drops nodes; the atom only says who is denied.
  render: (a) => {
    registerLayout("story.private.free", freeLayout);
    registerLayout("story.private.hand", rowLayout({ gap: 0.15 }));
    registerSurface("story.private.north", { layers: [{ paint: "accent" }], radius: 0.08 });
    registerSurface("story.private.south", { layers: [{ paint: "alert" }], radius: 0.08 });
    registerSurface("story.private.pile", { layers: [{ paint: "panelBg" }], radius: 0.08 });
    const desk = node("desk", Container({ layout: "story.private.free" }));
    const hand = (id: string, seat: string, face: string, y: number) => {
      const h = node(
        id,
        Container({ layout: "story.private.hand" }),
        Transformable({ at: { x: 0, y } }),
        Private({ access: [seat] }),
      );
      for (let i = 0; i < 3; i++) {
        add(h, node(`${id}.card#${i}`, Bounded({ bounds: rect(0.9, 1.3) }), Surfaced({ surface: face })));
      }
      return h;
    };
    add(desk, hand("northHand", "north", "story.private.north", -1.3));
    add(desk, hand("southHand", "south", "story.private.south", 1.3));
    add(
      desk,
      node(
        "openPile",
        Bounded({ bounds: rect(0.9, 1.3) }),
        Surfaced({ surface: "story.private.pile" }),
        Transformable({ at: { x: 2.4, y: 0 } }),
      ),
    );
    return scene(projected(desk, a.seat)).el;
  },
  args: { seat: "north" },
  argTypes: {
    seat: documented("arg.seat", { control: "select", options: ["north", "south"] }, "view"),
  },
  parameters: { gkDocStory: "private.hands" },
};
