import type { Meta, StoryObj } from "@storybook/html";
import {
  Acceptor,
  add,
  Bounded,
  Container,
  Draggable,
  extentOf,
  fieldsOf,
  Flippable,
  footprint,
  freeLayout,
  Grabber,
  installStockFlips,
  installStockGrabs,
  installStockGrains,
  installStockOccupied,
  node,
  Poser,
  rect,
  registerLayout,
  registerSurface,
  Rotatable,
  Surfaced,
  Transformable,
  type GrainRule,
  type TransformableFields,
  type Node,
  type Vec,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// POSER is what a zone does to what LANDS in it, grain by grain: take the turn from the arrangement
// (`derive`), impose one (`stamp`), or accept the one that arrived (`keep`) — and the same three for
// which side is up. Nothing here is a mode or a priority; each grain is one record of data.
//
// The shelf is a desk with two zones. The LEFT one declares nothing, so it changes nothing: a card
// dropped there lies exactly as it was carried. The RIGHT one wears the knobs. Drag the card across
// and back and the difference between the two is the whole atom.
//
// The card turns with two fingers (`Rotatable`), and starts at whatever `cardAngle` says, so there
// is always a turn for a rule to keep or throw away.
installStockGrabs();
installStockGrains();
installStockOccupied();
installStockFlips();

const meta: Meta = {
  title: "Atoms/Poser",
  parameters: {
    gkDoc: "poser.component",
    gkAtom: "Poser",
    gkFields: { angle: ["Rest"], side: ["Rest"] },
  },
};
export default meta;

const PLACE = { control: { type: "number", step: 0.1 } };
const TOKEN = { control: "text" };
const PAINT = { control: "select", options: PAINTS };
const DEGREES = { control: { type: "range", min: -90, max: 90, step: 5 } };
/** The stamped number means nothing to a rule that reads none — shown only when `stamp` is chosen. */
const STAMPED = { if: { arg: "zoneAngle", eq: "stamp" } };

interface PoserArgs {
  zoneAngle: string;
  zoneStamp: number;
  zoneSide: string;
  zoneTurns: number;
  cardAngle: number;
  face: string;
  facePaint: string;
  back: string;
  backPaint: string;
  zoneSurface: string;
  zonePaint: string;
  zoneX: number;
}

/** The zone's rule for a grain, as the panel spells it: a name, plus the number `stamp` reads. */
const ruleOf = (name: string, value = 0): GrainRule => ({ rule: name, value });

/**
 * Which container the finger let go over — the scene's own knowledge, which is why the wiring asks
 * for it instead of picking. A plain pick answers with the topmost thing DRAWN, and over a zone
 * holding a card that is the card.
 */
function zoneAt(root: Node, at: Vec): Node | undefined {
  // The demo desk is an unposed free layout, so parent space IS root space and a zone's own `at`
  // is where it stands. A game with a posed desk would ask its own arrangement instead.
  return root.children.find((zone) => {
    const box = footprint(zone);
    if (!box) return false;
    const { w, h } = extentOf(box);
    const seat = fieldsOf<TransformableFields>(zone, "Transformable")?.at ?? { x: 0, y: 0 };
    return Math.abs(at.x - seat.x) <= w / 2 && Math.abs(at.y - seat.y) <= h / 2;
  });
}

export const Rest: StoryObj<PoserArgs> = {
  render: ({ zoneAngle, zoneStamp, zoneSide, zoneTurns, cardAngle, face, facePaint, back, backPaint, zoneSurface, zonePaint, zoneX }) => {
    registerLayout("story.poser.free", freeLayout);
    registerSurface(face, { layers: [{ paint: facePaint }], radius: 0.08 });
    registerSurface(back, { layers: [{ paint: backPaint }], radius: 0.08 });
    registerSurface(zoneSurface, { layers: [{ paint: zonePaint }], radius: 0.12 });

    const desk = node("desk", Container({ layout: "story.poser.free" }));
    // THE ZONE THAT DECLARES NOTHING. Absence is the refusal everywhere in the kit, and here that
    // reads as "changes nothing": a card dropped on it lies exactly as it was carried.
    const plain = node(
      "plain",
      Bounded({ bounds: rect(2.2, 2.6) }),
      Container({ layout: "story.poser.free" }),
      Surfaced({ surface: zoneSurface }),
      Transformable({ at: { x: -zoneX, y: 0 } }),
      Acceptor({ accept: { and: [] } }),
      Grabber({ grab: "one" }),
    );
    // THE ZONE THAT DECLARES. Two grains, two records — and its own turn, so the two-bit reading is
    // on the shelf too: a zone turned over shows the backs of cards that were never touched.
    const ruled = node(
      "ruled",
      Bounded({ bounds: rect(2.2, 2.6) }),
      Container({ layout: "story.poser.free" }),
      Surfaced({ surface: zoneSurface }),
      Transformable({ at: { x: zoneX, y: 0 } }),
      Acceptor({ accept: { and: [] } }),
      Grabber({ grab: "one" }),
      Flippable({ turns: zoneTurns }),
      Poser({ angle: ruleOf(zoneAngle, zoneStamp), side: ruleOf(zoneSide) }),
    );
    const card = node(
      "card",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: face }),
      Transformable({ at: { x: 0, y: 0 }, angle: cardAngle }),
      Flippable({ flip: "turnOver", back }),
      Rotatable({}),
      Draggable({ onReject: "home" }),
    );
    add(plain, card);
    add(desk, plain);
    add(desk, ruled);
    return wireDrag(scene(desk, { animate: true }), { zoneAt }).el;
  },
  args: {
    zoneAngle: "derive",
    zoneStamp: 0,
    zoneSide: "keep",
    zoneTurns: 0,
    cardAngle: 15,
    face: "story.poser.face",
    facePaint: "accent",
    back: "story.poser.back",
    backPaint: "textMuted",
    zoneSurface: "story.poser.zone",
    zonePaint: "sunkBg",
    zoneX: 1.5,
  },
  argTypes: {
    zoneAngle: documented("arg.grainAngle", { control: "select", options: ["derive", "stamp", "keep"] }, "ruled zone/poser"),
    zoneStamp: documented("arg.grainStamp", { ...DEGREES, ...STAMPED }, "ruled zone/poser"),
    zoneSide: documented("arg.grainSide", { control: "select", options: ["up", "down", "keep"] }, "ruled zone/poser"),
    zoneTurns: documented("arg.zoneTurns", { control: { type: "range", min: 0, max: 1, step: 1 } }, "ruled zone/flippable"),
    cardAngle: documented("arg.cardAngle", DEGREES, "card/transformable"),
    face: documented("arg.registerAs", TOKEN, "card/surface"),
    facePaint: documented("arg.fill", PAINT, "card/surface"),
    back: documented("arg.registerAs", TOKEN, "card/flippable"),
    backPaint: documented("arg.fill", PAINT, "card/flippable"),
    zoneSurface: documented("arg.registerAs", TOKEN, "zones/surface"),
    zonePaint: documented("arg.fill", PAINT, "zones/surface"),
    zoneX: documented("arg.x", PLACE, "zones/transformable"),
  },
  parameters: { gkDocStory: "poser.rest" },
};
