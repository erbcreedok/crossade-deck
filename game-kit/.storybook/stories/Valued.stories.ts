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
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  Valued,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// VALUED is the element's own game data, as plain fields: a rank, a suit, a cost — whatever a
// RULE will read. The atom stores and never interprets; the reader is the rule language
// (`el.values.rank` in an Acceptor), sorting, scoring. That is why this scene needs no second
// mechanism to make the data visible: set the card's rank and watch the sevens zone change its
// verdict — through the same invite every willing zone already wears.
installStockCoats();
installStockCarries();

const meta: Meta = {
  title: "Atoms/Valued",
  parameters: {
    gkDoc: "valued.component",
    gkAtom: "Valued",
    gkFields: { values: ["Rank"] },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };
const RANK = { control: { type: "range", min: 1, max: 13, step: 1 } };
/** Shown only when a recipe is named: an absent coat has no strength and no colour to be asked about. */
const COATED = { if: { arg: "zoneRecipe", neq: "" } };

interface RankArgs {
  rank: number;
  deskLayout: string;
  zoneW: number;
  zoneH: number;
  zoneLayout: string;
  zoneSurface: string;
  zonePaint: string;
  zoneRadius: number;
  zoneX: number;
  zoneY: number;
  accepts: number;
  zoneRecipe: string;
  zoneLevel: number;
  zoneTint: string;
  cardW: number;
  cardH: number;
  cardSurface: string;
  cardPaint: string;
  cardRadius: number;
  cardX: number;
  cardY: number;
}

export const Rank: StoryObj<RankArgs> = {
  // ONE CARD, ONE NUMBER. The zone takes rank 7 and nothing else; `rank` writes the card's
  // `values`. Drag the card at it: at 7 the zone lights, at anything else it stays dark — the
  // rule reads `el.values.rank` off this very atom, and no other code path knows what a rank is.
  render: ({
    rank,
    deskLayout,
    zoneW,
    zoneH,
    zoneLayout,
    zoneSurface,
    zonePaint,
    zoneRadius,
    zoneX,
    zoneY,
    accepts,
    zoneRecipe,
    zoneLevel,
    zoneTint,
    cardW,
    cardH,
    cardSurface,
    cardPaint,
    cardRadius,
    cardX,
    cardY,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerLayout(zoneLayout, freeLayout);
    registerSurface(zoneSurface, { layers: [{ paint: zonePaint }], radius: zoneRadius });
    registerSurface(cardSurface, { layers: [{ paint: cardPaint }], radius: cardRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    add(
      desk,
      node(
        "sevenZone",
        Bounded({ bounds: rect(zoneW, zoneH) }),
        Container({ layout: zoneLayout }),
        Surfaced({ surface: zoneSurface }),
        Transformable({ at: { x: zoneX, y: zoneY } }),
        Acceptor({ accept: { eq: ["el.values.rank", accepts] } }),
        Inviting({ coat: { recipe: zoneRecipe, level: zoneLevel, tint: zoneTint } }),
      ),
    );
    add(
      desk,
      node(
        "card",
        Bounded({ bounds: rect(cardW, cardH) }),
        Surfaced({ surface: cardSurface }),
        Transformable({ at: { x: cardX, y: cardY } }),
        Valued({ values: { rank } }),
        Draggable(),
      ),
    );
    return wireDrag(scene(desk, { animate: true })).el;
  },
  args: {
    rank: 7,
    deskLayout: "story.valued.free",
    zoneW: 1.5,
    zoneH: 1.9,
    zoneLayout: "story.valued.zone.free",
    zoneSurface: "story.valued.zone",
    zonePaint: "sunkBg",
    zoneRadius: 0.12,
    zoneX: 1.2,
    zoneY: 0,
    accepts: 7,
    zoneRecipe: "wash",
    zoneLevel: 0.4,
    zoneTint: "accent",
    cardW: 1,
    cardH: 1.4,
    cardSurface: "story.valued.card",
    cardPaint: "accent",
    cardRadius: 0.08,
    cardX: -1.4,
    cardY: 0,
  },
  argTypes: {
    rank: documented("arg.rank", RANK, "card/valued"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    zoneW: documented("arg.w", SIZE, "seven zone/bounds"),
    zoneH: documented("arg.h", SIZE, "seven zone/bounds"),
    zoneLayout: documented("arg.layoutName", TOKEN, "seven zone/container"),
    zoneSurface: documented("arg.registerAs", TOKEN, "seven zone/surface"),
    zonePaint: documented("arg.fill", PAINT, "seven zone/surface"),
    zoneRadius: documented("arg.radius", RADIUS, "seven zone/surface"),
    zoneX: documented("arg.x", PLACE, "seven zone/transformable"),
    zoneY: documented("arg.y", PLACE, "seven zone/transformable"),
    accepts: documented("arg.accepts", RANK, "seven zone/acceptor"),
    zoneRecipe: documented("arg.coatRecipe", { control: "select", options: ["", ...coatNames()] }, "seven zone/inviting"),
    zoneLevel: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 }, ...COATED }, "seven zone/inviting"),
    zoneTint: documented("arg.coatTint", { control: "select", options: ["", ...PAINTS], ...COATED }, "seven zone/inviting"),
    cardW: documented("arg.w", SIZE, "card/bounds"),
    cardH: documented("arg.h", SIZE, "card/bounds"),
    cardSurface: documented("arg.registerAs", TOKEN, "card/surface"),
    cardPaint: documented("arg.fill", PAINT, "card/surface"),
    cardRadius: documented("arg.radius", RADIUS, "card/surface"),
    cardX: documented("arg.x", PLACE, "card/transformable"),
    cardY: documented("arg.y", PLACE, "card/transformable"),
  },
  parameters: { gkDocStory: "valued.rank" },
};
