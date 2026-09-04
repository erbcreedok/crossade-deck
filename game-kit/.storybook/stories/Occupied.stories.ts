import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Acceptor,
  Bounded,
  capture,
  Container,
  Displacer,
  Draggable,
  extentOf,
  fieldsOf,
  footprint,
  freeLayout,
  installStockOccupied,
  node,
  rect,
  registerLayout,
  registerOccupied,
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

// OCCUPIED is what happens to the one ALREADY in a slot when a drop lands on it — a SEPARATE
// question from `Acceptor`'s, which only answers "may this one enter" and is silent about the
// sitter. The cell on this shelf holds one man; drag the spare piece onto it and read the policy
// off what happens next:
//
//   reject  — the incomer bounces home, the sitter never moves.
//   merge   — both stay: the cell now holds two.
//   capture — the sitter is sent to the tray beside the cell, the incomer takes the slot.
//
// `swap` exists in the registry (the incomer takes the slot, the sitter goes back where the
// incomer came from) but has no picture here: the render side this catalog runs on only knows how
// to carry out `capture`, so a `swap` policy reads correctly in code and is left out of the demo
// rather than shown lying still, which would teach the wrong thing.
installStockOccupied();

const meta: Meta = {
  title: "Atoms/Occupied",
  parameters: {
    gkDoc: "occupied.component",
    gkAtom: "Displacer",
    gkFields: { occupied: ["Cell"] },
  },
};
export default meta;

const TOKEN = { control: "text" };
const PAINT = { control: "select", options: PAINTS };
const POLICIES = ["reject", "merge", "capture"];
const CAPTURE_TO = "story.occupied.tray";

/** The demo desk is an unposed free layout, so a zone's own `at` is where it stands. */
function zoneAt(root: Node, at: Vec): Node | undefined {
  return root.children.find((zone) => {
    const box = footprint(zone);
    if (!box) return false;
    const { w, h } = extentOf(box);
    const seat = fieldsOf<TransformableFields>(zone, "Transformable")?.at ?? { x: 0, y: 0 };
    return Math.abs(at.x - seat.x) <= w / 2 && Math.abs(at.y - seat.y) <= h / 2;
  });
}

interface OccupiedArgs {
  policy: string;
  cellSurface: string;
  cellPaint: string;
  traySurface: string;
  trayPaint: string;
  sitterSurface: string;
  sitterPaint: string;
  incomerSurface: string;
  incomerPaint: string;
}

export const Cell: StoryObj<OccupiedArgs> = {
  render: ({ policy, cellSurface, cellPaint, traySurface, trayPaint, sitterSurface, sitterPaint, incomerSurface, incomerPaint }) => {
    installStockOccupied();
    registerOccupied(CAPTURE_TO, capture(CAPTURE_TO));
    registerLayout("story.occupied.free", freeLayout);
    registerSurface(cellSurface, { layers: [{ paint: cellPaint }], radius: 0.12 });
    registerSurface(traySurface, { layers: [{ paint: trayPaint }], radius: 0.16 });
    registerSurface(sitterSurface, { layers: [{ paint: sitterPaint }], radius: 0.08 });
    registerSurface(incomerSurface, { layers: [{ paint: incomerPaint }], radius: 0.08 });

    const desk = node("desk", Container({ layout: "story.occupied.free" }));
    // ONE SEAT, and it says what it does about a sitter on itself — the record named `policy`
    // reads `capture(...)` under its own name so the picker can name it as plainly as the others.
    const cell = node(
      "cell",
      Bounded({ bounds: rect(1.4, 1.4) }),
      Container({ layout: "story.occupied.free" }),
      Surfaced({ surface: cellSurface }),
      Transformable({ at: { x: -1.6, y: 0 } }),
      Acceptor({}),
      Displacer({ occupied: policy === "capture" ? CAPTURE_TO : policy }),
    );
    add(cell, node("sitter", Bounded({ bounds: rect(0.9, 0.9) }), Surfaced({ surface: sitterSurface }), Draggable({ onReject: "home" })));
    // THE TRAY — nobody's, and it takes anything: `capture` sends the sitter here, and there is
    // nowhere else for it to have gone.
    const tray = node(
      CAPTURE_TO,
      Bounded({ bounds: rect(1.4, 1.4) }),
      Container({ layout: "story.occupied.free" }),
      Surfaced({ surface: traySurface }),
      Transformable({ at: { x: 1.6, y: 0 } }),
      Acceptor({}),
    );
    const incomer = node(
      "incomer",
      Bounded({ bounds: rect(0.9, 0.9) }),
      Surfaced({ surface: incomerSurface }),
      Transformable({ at: { x: 0, y: -1.8 } }),
      Draggable({ onReject: "home" }),
    );
    add(desk, cell);
    add(desk, tray);
    add(desk, incomer);
    return wireDrag(scene(desk, { animate: true }), { zoneAt }).el;
  },
  args: {
    policy: "capture",
    cellSurface: "story.occupied.cell",
    cellPaint: "sunkBg",
    traySurface: "story.occupied.tray.surface",
    trayPaint: "panelBg",
    sitterSurface: "story.occupied.sitter",
    sitterPaint: "textMuted",
    incomerSurface: "story.occupied.incomer",
    incomerPaint: "accent",
  },
  argTypes: {
    policy: documented("arg.policy", { control: "select", options: POLICIES }, "cell/displacer"),
    cellSurface: documented("arg.registerAs", TOKEN, "cell/surface"),
    cellPaint: documented("arg.fill", PAINT, "cell/surface"),
    traySurface: documented("arg.registerAs", TOKEN, "tray/surface"),
    trayPaint: documented("arg.fill", PAINT, "tray/surface"),
    sitterSurface: documented("arg.registerAs", TOKEN, "sitter/surface"),
    sitterPaint: documented("arg.fill", PAINT, "sitter/surface"),
    incomerSurface: documented("arg.registerAs", TOKEN, "incomer/surface"),
    incomerPaint: documented("arg.fill", PAINT, "incomer/surface"),
  },
  parameters: { gkDocStory: "occupied.cell" },
};
