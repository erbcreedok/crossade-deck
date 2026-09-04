import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Draggable,
  freeLayout,
  node,
  Reaching,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// REACHING defines how far past its own outline a node still counts as being at something.
// A bounding box says where a thing is; reaching says how far its pull extends.

const meta: Meta = {
  title: "Atoms/Reaching",
  parameters: {
    gkDoc: "reaching.component",
    gkAtom: "Reaching",
    gkFields: { reach: ["Reach"] },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0.2, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };

interface ReachArgs {
  reach: number;
  deskLayout: string;
  pieceW: number;
  pieceH: number;
  pieceSurface: string;
  piecePaint: string;
  pieceRadius: number;
  pieceX: number;
  pieceY: number;
  targetW: number;
  targetH: number;
  targetSurface: string;
  targetPaint: string;
  targetRadius: number;
  targetX: number;
  targetY: number;
}

export const Reach: StoryObj<ReachArgs> = {
  render: ({
    reach,
    deskLayout,
    pieceW,
    pieceH,
    pieceSurface,
    piecePaint,
    pieceRadius,
    pieceX,
    pieceY,
    targetW,
    targetH,
    targetSurface,
    targetPaint,
    targetRadius,
    targetX,
    targetY,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(pieceSurface, { layers: [{ paint: piecePaint }], radius: pieceRadius });
    registerSurface(targetSurface, { layers: [{ paint: targetPaint }], radius: targetRadius });

    const desk = node("desk", Container({ layout: deskLayout }));

    add(
      desk,
      node(
        "target",
        Bounded({ bounds: rect(targetW, targetH) }),
        Surfaced({ surface: targetSurface }),
        Transformable({ at: { x: targetX, y: targetY } }),
      ),
    );

    add(
      desk,
      node(
        "piece",
        Bounded({ bounds: rect(pieceW, pieceH) }),
        Surfaced({ surface: pieceSurface }),
        Transformable({ at: { x: pieceX, y: pieceY } }),
        Reaching({ reach }),
        Draggable(),
      ),
    );

    return wireDrag(scene(desk, { animate: true, bounds: true })).el;
  },
  args: {
    reach: 0.5,
    deskLayout: "story.reaching.free",
    pieceW: 1.2,
    pieceH: 1.2,
    pieceSurface: "story.reaching.piece",
    piecePaint: "accent",
    pieceRadius: 0.1,
    pieceX: -1.2,
    pieceY: 0,
    targetW: 1.4,
    targetH: 1.4,
    targetSurface: "story.reaching.target",
    targetPaint: "sunkBg",
    targetRadius: 0.12,
    targetX: 1.2,
    targetY: 0,
  },
  argTypes: {
    reach: documented("arg.reach", { control: { type: "number", min: 0, max: 2, step: 0.05 } }, "piece/reaching"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    pieceW: documented("arg.w", SIZE, "piece/bounds"),
    pieceH: documented("arg.h", SIZE, "piece/bounds"),
    pieceSurface: documented("arg.registerAs", TOKEN, "piece/surface"),
    piecePaint: documented("arg.fill", PAINT, "piece/surface"),
    pieceRadius: documented("arg.radius", RADIUS, "piece/surface"),
    pieceX: documented("arg.x", PLACE, "piece/transformable"),
    pieceY: documented("arg.y", PLACE, "piece/transformable"),
    targetW: documented("arg.w", SIZE, "target/bounds"),
    targetH: documented("arg.h", SIZE, "target/bounds"),
    targetSurface: documented("arg.registerAs", TOKEN, "target/surface"),
    targetPaint: documented("arg.fill", PAINT, "target/surface"),
    targetRadius: documented("arg.radius", RADIUS, "target/surface"),
    targetX: documented("arg.x", PLACE, "target/transformable"),
    targetY: documented("arg.y", PLACE, "target/transformable"),
  },
  parameters: { gkDocStory: "reaching.reach" },
};
