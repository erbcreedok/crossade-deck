import type { Meta, StoryObj } from "@storybook/html";
import {
  Acceptor,
  add,
  Bounded,
  coatNames,
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
import { documented, PAINTS } from "./surfaceControls.js";

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

/** The two decks on this desk — one slot each, and the card's own picker offers the same list. */
const BOXES = ["redDeck", "blueDeck"];
const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };
/** Shown only when a recipe is named: an absent coat has no strength and no colour to be asked about. */
const COATED = { if: { arg: "slotRecipe", neq: "" } };

interface BoxArgs {
  box: string;
  deskLayout: string;
  slotW: number;
  slotH: number;
  slotLayout: string;
  slotSurface: string;
  slotPaint: string;
  slotRadius: number;
  slotX: number;
  slotY: number;
  slotStepY: number;
  slotRecipe: string;
  slotLevel: number;
  slotTint: string;
  cardW: number;
  cardH: number;
  cardSurface: string;
  cardPaint: string;
  cardRadius: number;
  cardX: number;
  cardY: number;
}

export const Box: StoryObj<BoxArgs> = {
  // ONE CARD, TWO RETURN-SLOTS. Each slot takes only cards of its own box — `el.box` in the
  // rule reads this very atom. Flip `box` and drag: the matching slot lights, the other stays
  // dark. Nothing else changed about the card: the box is a name it carries, not where it sits.
  render: ({
    box,
    deskLayout,
    slotW,
    slotH,
    slotLayout,
    slotSurface,
    slotPaint,
    slotRadius,
    slotX,
    slotY,
    slotStepY,
    slotRecipe,
    slotLevel,
    slotTint,
    cardW,
    cardH,
    cardSurface,
    cardPaint,
    cardRadius,
    cardX,
    cardY,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerLayout(slotLayout, freeLayout);
    registerSurface(slotSurface, { layers: [{ paint: slotPaint }], radius: slotRadius });
    registerSurface(cardSurface, { layers: [{ paint: cardPaint }], radius: cardRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    for (const [i, deck] of BOXES.entries()) {
      add(
        desk,
        node(
          `${deck}Slot`,
          Bounded({ bounds: rect(slotW, slotH) }),
          Container({ layout: slotLayout }),
          Surfaced({ surface: slotSurface }),
          Transformable({ at: { x: slotX, y: slotY + i * slotStepY } }),
          Acceptor({ accept: { eq: ["el.box", deck] } }),
          Inviting({ coat: { recipe: slotRecipe, level: slotLevel, tint: slotTint } }),
        ),
      );
    }
    add(
      desk,
      node(
        "card",
        Bounded({ bounds: rect(cardW, cardH) }),
        Surfaced({ surface: cardSurface }),
        Transformable({ at: { x: cardX, y: cardY } }),
        Owned({ box }),
        Draggable(),
      ),
    );
    return wireDrag(scene(desk, { animate: true })).el;
  },
  args: {
    box: "redDeck",
    deskLayout: "story.owned.free",
    slotW: 1.4,
    slotH: 1.8,
    slotLayout: "story.owned.slot.free",
    slotSurface: "story.owned.zone",
    slotPaint: "sunkBg",
    slotRadius: 0.12,
    slotX: 1.3,
    slotY: -1.1,
    slotStepY: 2.2,
    slotRecipe: "wash",
    slotLevel: 0.4,
    slotTint: "accent",
    cardW: 1,
    cardH: 1.4,
    cardSurface: "story.owned.card",
    cardPaint: "accent",
    cardRadius: 0.08,
    cardX: -1.5,
    cardY: 0,
  },
  argTypes: {
    box: documented("arg.box", { control: "select", options: BOXES }, "card/owned"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    slotW: documented("arg.w", SIZE, "return slots/bounds"),
    slotH: documented("arg.h", SIZE, "return slots/bounds"),
    slotLayout: documented("arg.layoutName", TOKEN, "return slots/container"),
    slotSurface: documented("arg.registerAs", TOKEN, "return slots/surface"),
    slotPaint: documented("arg.fill", PAINT, "return slots/surface"),
    slotRadius: documented("arg.radius", RADIUS, "return slots/surface"),
    slotX: documented("arg.x", PLACE, "return slots/transformable"),
    slotY: documented("arg.y", PLACE, "return slots/transformable"),
    slotStepY: documented("arg.stepY", PLACE, "return slots/transformable"),
    slotRecipe: documented("arg.coatRecipe", { control: "select", options: ["", ...coatNames()] }, "return slots/inviting"),
    slotLevel: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 }, ...COATED }, "return slots/inviting"),
    slotTint: documented("arg.coatTint", { control: "select", options: ["", ...PAINTS], ...COATED }, "return slots/inviting"),
    cardW: documented("arg.w", SIZE, "card/bounds"),
    cardH: documented("arg.h", SIZE, "card/bounds"),
    cardSurface: documented("arg.registerAs", TOKEN, "card/surface"),
    cardPaint: documented("arg.fill", PAINT, "card/surface"),
    cardRadius: documented("arg.radius", RADIUS, "card/surface"),
    cardX: documented("arg.x", PLACE, "card/transformable"),
    cardY: documented("arg.y", PLACE, "card/transformable"),
  },
  parameters: { gkDocStory: "owned.box" },
};
