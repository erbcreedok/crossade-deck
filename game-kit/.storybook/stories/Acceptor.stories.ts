import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Acceptor,
  Bounded,
  Container,
  Draggable,
  extentOf,
  fieldsOf,
  footprint,
  freeLayout,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  type Node,
  type TransformableFields,
  type Vec,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// ACCEPTOR is what makes a container a ZONE: it answers whether an element may enter. A container
// without the atom is not a zone at all — it accepts nobody, rather than throwing — and the shelf
// puts that answer next to the alternative rather than describing it: the LEFT area is a plain
// `Container`, the RIGHT one wears `Acceptor` with a rule the reader sets. A card bounces home off
// either the moment its target denies it (`Draggable.onReject: "home"`); nothing else has to say so.
//
// The rule shown is a CAPACITY: `{ lt: ["target.count", capacity] }`. Set it to 0 and even the
// first drop is refused — the rule reads the container's real children, not a number the story
// tracks on the side.

const meta: Meta = {
  title: "Atoms/Acceptor",
  parameters: {
    gkDoc: "acceptor.component",
    gkAtom: "Acceptor",
    gkFields: { accept: ["Zones"] },
  },
};
export default meta;

const PLACE = { control: { type: "number", step: 0.1 } };
const TOKEN = { control: "text" };
const PAINT = { control: "select", options: PAINTS };
const RULES = ["openDoor", "capacity"];
/** The number only means anything to the capacity rule — shown only when it is the one chosen. */
const CAPACITY_ONLY = { if: { arg: "rule", eq: "capacity" } };

interface AcceptorArgs {
  rule: string;
  capacity: number;
  zoneX: number;
  zoneSurface: string;
  zonePaint: string;
  cardSurface: string;
  cardPaint: string;
}

/** Which zone the finger let go over — the demo desk is an unposed free layout, so a zone's own
 * `at` is where it stands and parent space IS root space. */
function zoneAt(root: Node, at: Vec): Node | undefined {
  return root.children.find((zone) => {
    const box = footprint(zone);
    if (!box) return false;
    const { w, h } = extentOf(box);
    const seat = fieldsOf<TransformableFields>(zone, "Transformable")?.at ?? { x: 0, y: 0 };
    return Math.abs(at.x - seat.x) <= w / 2 && Math.abs(at.y - seat.y) <= h / 2;
  });
}

export const Zones: StoryObj<AcceptorArgs> = {
  render: ({ rule, capacity, zoneX, zoneSurface, zonePaint, cardSurface, cardPaint }) => {
    registerLayout("story.acceptor.free", freeLayout);
    registerSurface(zoneSurface, { layers: [{ paint: zonePaint }], radius: 0.12 });
    registerSurface(cardSurface, { layers: [{ paint: cardPaint }], radius: 0.08 });

    const desk = node("desk", Container({ layout: "story.acceptor.free" }));
    // NO ACCEPTOR — a plain container. It has no say in what enters because it is not a zone at
    // all, and the drop denies here without a rule ever being read.
    const bare = node(
      "bare",
      Bounded({ bounds: rect(2, 2) }),
      Container({ layout: "story.acceptor.free" }),
      Surfaced({ surface: zoneSurface }),
      Transformable({ at: { x: -zoneX, y: 0 } }),
    );
    // WEARS THE ATOM, and the rule is the reader's choice: the open door (default `and: []`) or a
    // capacity read off the container's real child count.
    const ruled = node(
      "ruled",
      Bounded({ bounds: rect(2, 2) }),
      Container({ layout: "story.acceptor.free" }),
      Surfaced({ surface: zoneSurface }),
      Transformable({ at: { x: zoneX, y: 0 } }),
      rule === "capacity" ? Acceptor({ accept: { lt: ["target.count", capacity] } }) : Acceptor({ accept: { and: [] } }),
    );
    const card = node(
      "card",
      Bounded({ bounds: rect(0.8, 0.8) }),
      Surfaced({ surface: cardSurface }),
      Transformable({ at: { x: 0, y: -zoneX - 1.4 } }),
      Draggable({ onReject: "home" }),
    );
    add(desk, bare);
    add(desk, ruled);
    add(desk, card);
    return wireDrag(scene(desk, { animate: true }), { zoneAt }).el;
  },
  args: {
    rule: "capacity",
    capacity: 1,
    zoneX: 1.4,
    zoneSurface: "story.acceptor.zone",
    zonePaint: "sunkBg",
    cardSurface: "story.acceptor.card",
    cardPaint: "accent",
  },
  argTypes: {
    rule: documented("arg.rule", { control: "select", options: RULES }, "ruled zone/acceptor"),
    capacity: documented(
      "arg.capacity",
      { ...CAPACITY_ONLY, control: { type: "number", min: 0, max: 3, step: 1 } },
      "ruled zone/acceptor",
    ),
    zoneX: documented("arg.x", PLACE, "zones/transformable"),
    zoneSurface: documented("arg.registerAs", TOKEN, "zones/surface"),
    zonePaint: documented("arg.fill", PAINT, "zones/surface"),
    cardSurface: documented("arg.registerAs", TOKEN, "card/surface"),
    cardPaint: documented("arg.fill", PAINT, "card/surface"),
  },
  parameters: { gkDocStory: "acceptor.zones" },
};
