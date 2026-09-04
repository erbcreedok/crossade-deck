import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Draggable,
  Forgiving,
  freeLayout,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// FORGIVING determines how far a touch or pointer may miss a node and still grab it.
// Aimed at with fingertips, drawn for eyes: narrow handles catch near-misses without being drawn as slabs.

const meta: Meta = {
  title: "Atoms/Forgiving",
  parameters: {
    gkDoc: "forgiving.component",
    gkAtom: "Forgiving",
    gkFields: { miss: ["Miss"] },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0.1, step: 0.05 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };

interface MissArgs {
  miss: number;
  deskLayout: string;
  tabW: number;
  tabH: number;
  tabSurface: string;
  tabPaint: string;
  tabRadius: number;
  tabX: number;
  tabY: number;
  cardW: number;
  cardH: number;
  cardSurface: string;
  cardPaint: string;
  cardRadius: number;
  cardX: number;
  cardY: number;
}

export const Miss: StoryObj<MissArgs> = {
  render: ({
    miss,
    deskLayout,
    tabW,
    tabH,
    tabSurface,
    tabPaint,
    tabRadius,
    tabX,
    tabY,
    cardW,
    cardH,
    cardSurface,
    cardPaint,
    cardRadius,
    cardX,
    cardY,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(tabSurface, { layers: [{ paint: tabPaint }], radius: tabRadius });
    registerSurface(cardSurface, { layers: [{ paint: cardPaint }], radius: cardRadius });

    const desk = node("desk", Container({ layout: deskLayout }));

    add(
      desk,
      node(
        "card",
        Bounded({ bounds: rect(cardW, cardH) }),
        Surfaced({ surface: cardSurface }),
        Transformable({ at: { x: cardX, y: cardY } }),
        Draggable(),
      ),
    );

    add(
      desk,
      node(
        "tab",
        Bounded({ bounds: rect(tabW, tabH) }),
        Surfaced({ surface: tabSurface }),
        Transformable({ at: { x: tabX, y: tabY } }),
        Forgiving({ miss }),
        Draggable(),
      ),
    );

    return wireDrag(scene(desk, { animate: true, bounds: true })).el;
  },
  args: {
    miss: 0.4,
    deskLayout: "story.forgiving.free",
    tabW: 1.4,
    tabH: 0.3,
    tabSurface: "story.forgiving.tab",
    tabPaint: "accent",
    tabRadius: 0.06,
    tabX: 0,
    tabY: 1.4,
    cardW: 1.6,
    cardH: 2.0,
    cardSurface: "story.forgiving.card",
    cardPaint: "panelBg",
    cardRadius: 0.1,
    cardX: 0,
    cardY: -0.1,
  },
  argTypes: {
    miss: documented("arg.miss", { control: { type: "number", min: 0, max: 1.5, step: 0.05 } }, "tab/forgiving"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    tabW: documented("arg.w", SIZE, "tab/bounds"),
    tabH: documented("arg.h", SIZE, "tab/bounds"),
    tabSurface: documented("arg.registerAs", TOKEN, "tab/surface"),
    tabPaint: documented("arg.fill", PAINT, "tab/surface"),
    tabRadius: documented("arg.radius", RADIUS, "tab/surface"),
    tabX: documented("arg.x", PLACE, "tab/transformable"),
    tabY: documented("arg.y", PLACE, "tab/transformable"),
    cardW: documented("arg.w", SIZE, "card/bounds"),
    cardH: documented("arg.h", SIZE, "card/bounds"),
    cardSurface: documented("arg.registerAs", TOKEN, "card/surface"),
    cardPaint: documented("arg.fill", PAINT, "card/surface"),
    cardRadius: documented("arg.radius", RADIUS, "card/surface"),
    cardX: documented("arg.x", PLACE, "card/transformable"),
    cardY: documented("arg.y", PLACE, "card/transformable"),
  },
  parameters: { gkDocStory: "forgiving.miss" },
};
