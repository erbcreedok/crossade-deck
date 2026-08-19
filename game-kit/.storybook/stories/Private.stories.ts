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
import { documented, PAINTS } from "./surfaceControls.js";

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

/** The seats this desk plays. Every seat picker below offers the same list, so none can drift. */
const SEATS = ["north", "south"];
const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };

/** The atom's list: one viewpoint, or the empty list that hides the subtree from everyone. */
const seenBy = (seat: string): string[] => (seat ? [seat] : []);

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
  deskLayout: string;
  handLayout: string;
  handGap: number;
  handCards: number;
  cardW: number;
  cardH: number;
  northSurface: string;
  northPaint: string;
  northRadius: number;
  northX: number;
  northY: number;
  northAccess: string;
  southSurface: string;
  southPaint: string;
  southRadius: number;
  southX: number;
  southY: number;
  southAccess: string;
  pileW: number;
  pileH: number;
  pileSurface: string;
  pilePaint: string;
  pileRadius: number;
  pileX: number;
  pileY: number;
}

export const Hands: StoryObj<HandsArgs> = {
  // TWO PRIVATE HANDS AND YOUR EYES. Pick `seat`: your own hand's cards are on the desk, the
  // other hand is simply NOT THERE — the cut takes the subtree, so its cards never needed an
  // atom of their own. The middle pile carries no `Private` and shows for everyone. Whether the
  // other seat sees nothing (this scene) or face-down backs is the GAME's choice — a projection
  // may swap faces before it drops nodes; the atom only says who is denied.
  render: ({
    seat,
    deskLayout,
    handLayout,
    handGap,
    handCards,
    cardW,
    cardH,
    northSurface,
    northPaint,
    northRadius,
    northX,
    northY,
    northAccess,
    southSurface,
    southPaint,
    southRadius,
    southX,
    southY,
    southAccess,
    pileW,
    pileH,
    pileSurface,
    pilePaint,
    pileRadius,
    pileX,
    pileY,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerLayout(handLayout, rowLayout({ gap: handGap }));
    registerSurface(northSurface, { layers: [{ paint: northPaint }], radius: northRadius });
    registerSurface(southSurface, { layers: [{ paint: southPaint }], radius: southRadius });
    registerSurface(pileSurface, { layers: [{ paint: pilePaint }], radius: pileRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    const hand = (id: string, access: string, face: string, x: number, y: number) => {
      const h = node(
        id,
        Container({ layout: handLayout }),
        Transformable({ at: { x, y } }),
        Private({ access: seenBy(access) }),
      );
      for (let i = 0; i < handCards; i++) {
        add(h, node(`${id}.card#${i}`, Bounded({ bounds: rect(cardW, cardH) }), Surfaced({ surface: face })));
      }
      return h;
    };
    add(desk, hand("northHand", northAccess, northSurface, northX, northY));
    add(desk, hand("southHand", southAccess, southSurface, southX, southY));
    add(
      desk,
      node(
        "openPile",
        Bounded({ bounds: rect(pileW, pileH) }),
        Surfaced({ surface: pileSurface }),
        Transformable({ at: { x: pileX, y: pileY } }),
      ),
    );
    return scene(projected(desk, seat)).el;
  },
  args: {
    seat: "north",
    deskLayout: "story.private.free",
    handLayout: "story.private.hand",
    handGap: 0.15,
    handCards: 3,
    cardW: 0.9,
    cardH: 1.3,
    northSurface: "story.private.north",
    northPaint: "accent",
    northRadius: 0.08,
    northX: 0,
    northY: -1.3,
    northAccess: "north",
    southSurface: "story.private.south",
    southPaint: "alert",
    southRadius: 0.08,
    southX: 0,
    southY: 1.3,
    southAccess: "south",
    pileW: 0.9,
    pileH: 1.3,
    pileSurface: "story.private.pile",
    pilePaint: "panelBg",
    pileRadius: 0.08,
    pileX: 2.4,
    pileY: 0,
  },
  argTypes: {
    seat: documented("arg.seat", { control: "select", options: SEATS }, "view"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    handLayout: documented("arg.layoutName", TOKEN, "hands/container"),
    handGap: documented("arg.gap", { control: { type: "number", min: 0, step: 0.02 } }, "hands/container"),
    handCards: documented("arg.childCount", { control: { type: "range", min: 0, max: 8, step: 1 } }, "hands/children"),
    cardW: documented("arg.w", SIZE, "hands/children"),
    cardH: documented("arg.h", SIZE, "hands/children"),
    northSurface: documented("arg.registerAs", TOKEN, "north hand/surface"),
    northPaint: documented("arg.fill", PAINT, "north hand/surface"),
    northRadius: documented("arg.radius", RADIUS, "north hand/surface"),
    northX: documented("arg.x", PLACE, "north hand/transformable"),
    northY: documented("arg.y", PLACE, "north hand/transformable"),
    northAccess: documented("arg.access", { control: "select", options: ["", ...SEATS] }, "north hand/private"),
    southSurface: documented("arg.registerAs", TOKEN, "south hand/surface"),
    southPaint: documented("arg.fill", PAINT, "south hand/surface"),
    southRadius: documented("arg.radius", RADIUS, "south hand/surface"),
    southX: documented("arg.x", PLACE, "south hand/transformable"),
    southY: documented("arg.y", PLACE, "south hand/transformable"),
    southAccess: documented("arg.access", { control: "select", options: ["", ...SEATS] }, "south hand/private"),
    pileW: documented("arg.w", SIZE, "open pile/bounds"),
    pileH: documented("arg.h", SIZE, "open pile/bounds"),
    pileSurface: documented("arg.registerAs", TOKEN, "open pile/surface"),
    pilePaint: documented("arg.fill", PAINT, "open pile/surface"),
    pileRadius: documented("arg.radius", RADIUS, "open pile/surface"),
    pileX: documented("arg.x", PLACE, "open pile/transformable"),
    pileY: documented("arg.y", PLACE, "open pile/transformable"),
  },
  parameters: { gkDocStory: "private.hands" },
};
