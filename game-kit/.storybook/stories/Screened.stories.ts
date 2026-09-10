import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  node,
  rect,
  registerLayout,
  registerSurface,
  Screened,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// SCREENED ensures a node keeps its size on the glass regardless of camera zoom.
// While world objects scale with the view, controls and handles stay sized for fingertips.

const meta: Meta = {
  title: "Atoms/Screened",
  parameters: {
    gkDoc: "screened.component",
    gkAtom: "Screened",
    gkFields: {
      screened: ["Screen"],
      min: ["Screen"],
      max: ["Screen"],
    },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0.1, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };

interface ScreenArgs {
  screened: boolean;
  min: number;
  max: number;
  deskLayout: string;
  cardW: number;
  cardH: number;
  cardSurface: string;
  cardPaint: string;
  cardRadius: number;
  cardX: number;
  cardY: number;
  handleW: number;
  handleH: number;
  handleSurface: string;
  handlePaint: string;
  handleRadius: number;
  handleX: number;
  handleY: number;
}

export const Screen: StoryObj<ScreenArgs> = {
  render: ({
    screened,
    min,
    max,
    deskLayout,
    cardW,
    cardH,
    cardSurface,
    cardPaint,
    cardRadius,
    cardX,
    cardY,
    handleW,
    handleH,
    handleSurface,
    handlePaint,
    handleRadius,
    handleX,
    handleY,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(cardSurface, { layers: [{ paint: cardPaint }], radius: cardRadius });
    registerSurface(handleSurface, { layers: [{ paint: handlePaint }], radius: handleRadius });

    const desk = node("desk", Container({ layout: deskLayout }));

    add(
      desk,
      node(
        "card",
        Bounded({ bounds: rect(cardW, cardH) }),
        Surfaced({ surface: cardSurface }),
        Transformable({ at: { x: cardX, y: cardY } }),
      ),
    );

    add(
      desk,
      node(
        "handle",
        Bounded({ bounds: rect(handleW, handleH) }),
        Surfaced({ surface: handleSurface }),
        Transformable({ at: { x: handleX, y: handleY } }),
        Screened({ screened, min, max }),
      ),
    );

    return scene(desk, {
      camera: {
        limits: { minZoom: 0.4, maxZoom: 3, input: { zoom: true, pan: true, rotate: false, tilt: false } },
        content: { x: -4, y: -4, w: 8, h: 8 },
      },
    }).el;
  },
  args: {
    screened: true,
    min: 0.8,
    max: 1.5,
    deskLayout: "story.screened.free",
    cardW: 2.0,
    cardH: 2.8,
    cardSurface: "story.screened.card",
    cardPaint: "panelBg",
    cardRadius: 0.12,
    cardX: 0,
    cardY: 0,
    handleW: 0.5,
    handleH: 0.5,
    handleSurface: "story.screened.handle",
    handlePaint: "accent",
    handleRadius: 0.08,
    handleX: 0.8,
    handleY: -1.2,
  },
  argTypes: {
    screened: documented("arg.screened", { control: "boolean" }, "handle/screened"),
    min: documented("arg.screenMin", { control: { type: "number", min: 0.2, max: 2, step: 0.1 } }, "handle/screened"),
    max: documented("arg.screenMax", { control: { type: "number", min: 0.5, max: 4, step: 0.1 } }, "handle/screened"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    cardW: documented("arg.w", SIZE, "card/bounds"),
    cardH: documented("arg.h", SIZE, "card/bounds"),
    cardSurface: documented("arg.registerAs", TOKEN, "card/surface"),
    cardPaint: documented("arg.fill", PAINT, "card/surface"),
    cardRadius: documented("arg.radius", RADIUS, "card/surface"),
    cardX: documented("arg.x", PLACE, "card/transformable"),
    cardY: documented("arg.y", PLACE, "card/transformable"),
    handleW: documented("arg.w", SIZE, "handle/bounds"),
    handleH: documented("arg.h", SIZE, "handle/bounds"),
    handleSurface: documented("arg.registerAs", TOKEN, "handle/surface"),
    handlePaint: documented("arg.fill", PAINT, "handle/surface"),
    handleRadius: documented("arg.radius", RADIUS, "handle/surface"),
    handleX: documented("arg.x", PLACE, "handle/transformable"),
    handleY: documented("arg.y", PLACE, "handle/transformable"),
  },
  parameters: { gkDocStory: "screened.screen" },
};
