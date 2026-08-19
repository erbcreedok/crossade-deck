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
import { documented, PAINTS } from "./surfaceControls.js";

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

/** The two seats this desk plays. Every seat picker below offers the same list, so none can drift. */
const SEATS = ["north", "south"];
const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };

/** The atom's list: one seat, or the empty list that locks the subtree to everyone. */
const gripBy = (seat: string): string[] => (seat ? [seat] : []);

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
  northSeat: string;
  southSurface: string;
  southPaint: string;
  southRadius: number;
  southX: number;
  southY: number;
  southSeat: string;
  openW: number;
  openH: number;
  openSurface: string;
  openPaint: string;
  openRadius: number;
  openX: number;
  openY: number;
  markW: number;
  markH: number;
  markSurface: string;
  markPaint: string;
  markRadius: number;
  markX: number;
  markY: number;
  markSeat: string;
}

export const Hands: StoryObj<HandsArgs> = {
  // TWO HANDS AND YOUR SEAT. Pick `seat` and try dragging: your own hand's cards lift, the other
  // hand's refuse the finger — the grip cuts the SUBTREE, so the cards never carried the atom
  // themselves. The open card in the middle lifts for either seat (no grip, the open desk), and
  // the pale mark refuses both: its `by` is the empty list, a board element locked to everyone.
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
    northSeat,
    southSurface,
    southPaint,
    southRadius,
    southX,
    southY,
    southSeat,
    openW,
    openH,
    openSurface,
    openPaint,
    openRadius,
    openX,
    openY,
    markW,
    markH,
    markSurface,
    markPaint,
    markRadius,
    markX,
    markY,
    markSeat,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerLayout(handLayout, rowLayout({ gap: handGap }));
    registerSurface(northSurface, { layers: [{ paint: northPaint }], radius: northRadius });
    registerSurface(southSurface, { layers: [{ paint: southPaint }], radius: southRadius });
    registerSurface(openSurface, { layers: [{ paint: openPaint }], radius: openRadius });
    registerSurface(markSurface, { layers: [{ paint: markPaint }], radius: markRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    const hand = (id: string, held: string, face: string, x: number, y: number) => {
      const h = node(
        id,
        Container({ layout: handLayout }),
        Transformable({ at: { x, y } }),
        Grippable({ by: gripBy(held) }),
      );
      for (let i = 0; i < handCards; i++) {
        add(h, node(`${id}.card#${i}`, Bounded({ bounds: rect(cardW, cardH) }), Surfaced({ surface: face }), Draggable()));
      }
      return h;
    };
    add(desk, hand("northHand", northSeat, northSurface, northX, northY));
    add(desk, hand("southHand", southSeat, southSurface, southX, southY));
    add(
      desk,
      node(
        "openCard",
        Bounded({ bounds: rect(openW, openH) }),
        Surfaced({ surface: openSurface }),
        Transformable({ at: { x: openX, y: openY } }),
        Draggable(),
      ),
    );
    add(
      desk,
      node(
        "lockedMark",
        Bounded({ bounds: rect(markW, markH) }),
        Surfaced({ surface: markSurface }),
        Transformable({ at: { x: markX, y: markY } }),
        Draggable(),
        Grippable({ by: gripBy(markSeat) }),
      ),
    );
    return wireDrag(scene(desk, { animate: true }), {
      may: (n) => grippableBy(n, seat),
    }).el;
  },
  args: {
    seat: "north",
    deskLayout: "story.grip.free",
    handLayout: "story.grip.hand",
    handGap: 0.15,
    handCards: 3,
    cardW: 0.9,
    cardH: 1.3,
    northSurface: "story.grip.north",
    northPaint: "accent",
    northRadius: 0.08,
    northX: -0.6,
    northY: -1.3,
    northSeat: "north",
    southSurface: "story.grip.south",
    southPaint: "alert",
    southRadius: 0.08,
    southX: -0.6,
    southY: 1.3,
    southSeat: "south",
    openW: 0.9,
    openH: 1.3,
    openSurface: "story.grip.open",
    openPaint: "panelBg",
    openRadius: 0.08,
    openX: 2.2,
    openY: 0,
    markW: 0.7,
    markH: 0.7,
    markSurface: "story.grip.mark",
    markPaint: "sunkBg",
    markRadius: 0.5,
    markX: -2.6,
    markY: 0,
    markSeat: "",
  },
  argTypes: {
    seat: documented("arg.seat", { control: "select", options: SEATS }, "wiring"),
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
    northSeat: documented("arg.by", { control: "select", options: ["", ...SEATS] }, "north hand/grippable"),
    southSurface: documented("arg.registerAs", TOKEN, "south hand/surface"),
    southPaint: documented("arg.fill", PAINT, "south hand/surface"),
    southRadius: documented("arg.radius", RADIUS, "south hand/surface"),
    southX: documented("arg.x", PLACE, "south hand/transformable"),
    southY: documented("arg.y", PLACE, "south hand/transformable"),
    southSeat: documented("arg.by", { control: "select", options: ["", ...SEATS] }, "south hand/grippable"),
    openW: documented("arg.w", SIZE, "open card/bounds"),
    openH: documented("arg.h", SIZE, "open card/bounds"),
    openSurface: documented("arg.registerAs", TOKEN, "open card/surface"),
    openPaint: documented("arg.fill", PAINT, "open card/surface"),
    openRadius: documented("arg.radius", RADIUS, "open card/surface"),
    openX: documented("arg.x", PLACE, "open card/transformable"),
    openY: documented("arg.y", PLACE, "open card/transformable"),
    markW: documented("arg.w", SIZE, "locked mark/bounds"),
    markH: documented("arg.h", SIZE, "locked mark/bounds"),
    markSurface: documented("arg.registerAs", TOKEN, "locked mark/surface"),
    markPaint: documented("arg.fill", PAINT, "locked mark/surface"),
    markRadius: documented("arg.radius", RADIUS, "locked mark/surface"),
    markX: documented("arg.x", PLACE, "locked mark/transformable"),
    markY: documented("arg.y", PLACE, "locked mark/transformable"),
    markSeat: documented("arg.by", { control: "select", options: ["", ...SEATS] }, "locked mark/grippable"),
  },
  parameters: { gkDocStory: "grippable.hands" },
};
