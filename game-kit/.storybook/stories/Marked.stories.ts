import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Draggable,
  freeLayout,
  installStockMarkIcons,
  installStockMarks,
  mark,
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

// MARKED attaches an action record ("who did what") to a node.
// Stock marks and icons display as a corner badge filled with the acting player's ink.

installStockMarks();
installStockMarkIcons();

const meta: Meta = {
  title: "Atoms/Marked",
  parameters: {
    gkDoc: "marked.component",
    gkAtom: "Marked",
    gkFields: {
      by: ["Mark"],
      mark: ["Mark"],
      at: ["Mark"],
      from: ["Mark"],
    },
  },
};
export default meta;

const MARKS = ["moved", "lifted", "captured", "removed", "flipped", "thrown", "action"];
const SEATS = ["south", "north", "east", "west"];

const SIZE = { control: { type: "number", min: 0.5, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };

interface MarkArgs {
  mark: string;
  by: string;
  deskLayout: string;
  pieceW: number;
  pieceH: number;
  pieceSurface: string;
  piecePaint: string;
  pieceRadius: number;
  pieceX: number;
  pieceY: number;
}

export const Mark: StoryObj<MarkArgs> = {
  render: ({
    mark: actionMark,
    by,
    deskLayout,
    pieceW,
    pieceH,
    pieceSurface,
    piecePaint,
    pieceRadius,
    pieceX,
    pieceY,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(pieceSurface, { layers: [{ paint: piecePaint }], radius: pieceRadius });

    const desk = node("desk", Container({ layout: deskLayout }));

    const piece = mark(
      node(
        "piece",
        Bounded({ bounds: rect(pieceW, pieceH) }),
        Surfaced({ surface: pieceSurface }),
        Transformable({ at: { x: pieceX, y: pieceY } }),
        Draggable(),
      ),
      { by, mark: actionMark, at: Date.now() },
    );

    add(desk, piece);

    return wireDrag(scene(desk, { animate: true })).el;
  },
  args: {
    mark: "moved",
    by: "south",
    deskLayout: "story.marked.free",
    pieceW: 1.6,
    pieceH: 2.2,
    pieceSurface: "story.marked.piece",
    piecePaint: "panelBg",
    pieceRadius: 0.12,
    pieceX: 0,
    pieceY: 0,
  },
  argTypes: {
    mark: documented("arg.mark", { control: "select", options: MARKS }, "piece/marked"),
    by: documented("arg.by", { control: "select", options: SEATS }, "piece/marked"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    pieceW: documented("arg.w", SIZE, "piece/bounds"),
    pieceH: documented("arg.h", SIZE, "piece/bounds"),
    pieceSurface: documented("arg.registerAs", TOKEN, "piece/surface"),
    piecePaint: documented("arg.fill", PAINT, "piece/surface"),
    pieceRadius: documented("arg.radius", RADIUS, "piece/surface"),
    pieceX: documented("arg.x", PLACE, "piece/transformable"),
    pieceY: documented("arg.y", PLACE, "piece/transformable"),
  },
  parameters: { gkDocStory: "marked.mark" },
};
