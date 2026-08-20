import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  draggable,
  Draggable,
  Flippable,
  freeLayout,
  installStockLayouts,
  node,
  Private,
  project,
  rect,
  registerLayout,
  registerSurface,
  rowLayout,
  Surfaced,
  Transformable,
  type Node,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// ONE BOARD, SEVERAL PAIRS OF EYES — the shape a live table has, standing in one page.
//
// The truth is a SINGLE tree. Every screen is handed a PROJECTION of it: the same board, minus the
// subtrees those eyes are denied, plus a camera turned so that seat's edge is the near one. Nothing
// downstream knows a thing about who is watching — the renderer draws an ordinary board, and the
// only per-viewer decision was made once, before mounting.
//
// That is not a demo trick. It is the canon's line taken literally: the view is LOCAL, so privacy
// is a fact of the tree and never of the renderer. A seat is not given a flag to draw differently;
// it is given a different tree. Which is also why the projection had to become a COPY — two seats
// cutting into one board would eat each other's view, and then the truth itself.
//
// What each screen shows: the shared desk from its own side, its own hand, and no one else's.
// Other players' hands are ABSENT rather than face-down — showing them as backs is the `others`
// axis of `facing`, which is a different question and not yet built.

const meta: Meta<SeatsArgs> = {
  title: "Canvas/Seats",
  parameters: { gkDoc: "canvasSeats.component" },
};
export default meta;

const SEATS = ["south", "west", "north", "east"] as const;
/** Where a seat sits, and how far the view turns so that edge is the near one. */
const AROUND: Record<string, { at: { x: number; y: number }; turn: number }> = {
  south: { at: { x: 0, y: 2.1 }, turn: 0 },
  west: { at: { x: -3.2, y: 0 }, turn: -90 },
  north: { at: { x: 0, y: -2.1 }, turn: 180 },
  east: { at: { x: 3.2, y: 0 }, turn: 90 },
};

const FELT = "story.seats.felt";
const FACE = "story.seats.face";
const BACK = "story.seats.back";
const PILE = "story.seats.pile";

const PAINT = { control: "select", options: PAINTS };

interface SeatsArgs {
  screens: number;
  handCards: number;
  pitch: number;
  feltPaint: string;
  facePaint: string;
}

/**
 * THE TRUTH — one tree, built once per render and never shown to anyone directly.
 *
 * Hands are `Private` to their own seat. A hand is an ordinary container with an ordinary row in
 * it; what makes it a secret is one atom listing who may look, and the cut reaches the cards inside
 * because `Private` takes the whole SUBTREE.
 */
function board(seats: readonly string[], handCards: number): Node {
  const desk = node(
    "desk",
    Bounded({ bounds: rect(9, 6) }),
    Container({ layout: "story.seats.free" }),
    Surfaced({ surface: FELT }),
  );
  // The shared middle: everyone sees this, from their own side.
  const pile = node(
    "pile",
    Bounded({ bounds: rect(1.2, 1.6) }),
    Container({ layout: "story.seats.free" }),
    Surfaced({ surface: PILE }),
    Transformable({ at: { x: 0, y: 0 } }),
  );
  add(desk, pile);
  for (const seat of seats) {
    const hand = node(
      `hand:${seat}`,
      Container({ layout: "story.seats.row" }),
      Transformable({ at: AROUND[seat]!.at }),
      Private({ access: [seat] }),
    );
    for (let i = 0; i < handCards; i += 1) {
      add(
        hand,
        node(
          `${seat}:${i}`,
          Bounded({ bounds: rect(0.8, 1.12) }),
          Surfaced({ surface: FACE }),
          Transformable({}),
          Flippable({ flip: "turnOver", back: BACK }),
          Draggable({ onReject: "home" }),
        ),
      );
    }
    add(desk, hand);
  }
  return desk;
}

export const Table: StoryObj<SeatsArgs> = {
  render: ({ screens, handCards, pitch, feltPaint, facePaint }) => {
    installStockLayouts();
    registerLayout("story.seats.free", freeLayout);
    registerLayout("story.seats.row", rowLayout({ gap: 0.08 }));
    registerSurface(FELT, { layers: [{ paint: feltPaint }], radius: 0.3 });
    registerSurface(FACE, { layers: [{ paint: facePaint }], radius: 0.08 });
    registerSurface(BACK, { layers: [{ paint: "textMuted" }], radius: 0.08 });
    registerSurface(PILE, { layers: [{ paint: "sunkBg" }], radius: 0.12 });

    const seats = SEATS.slice(0, Math.max(2, Math.min(4, Math.round(screens))));
    const truth = board(seats, handCards);

    const wall = document.createElement("div");
    wall.style.cssText = [
      "display:grid",
      `grid-template-columns:repeat(${seats.length === 4 ? 2 : seats.length},1fr)`,
      "gap:8px",
      "height:100%",
      "min-height:360px",
    ].join(";");

    for (const seat of seats) {
      const pane = document.createElement("div");
      pane.style.cssText = "position:relative;min-height:180px";
      // ONE PROJECTION PER SCREEN, off the one truth. The screen is keyed by its seat so a re-render
      // finds it standing: unkeyed, each screen would take a fresh WebGL context per keystroke.
      const built = scene(project(truth, seat), {
        key: seat,
        animate: true,
        camera: {
          limits: { minZoom: 0.4, maxZoom: 3, input: { pan: true, zoom: true, rotate: false } },
          content: { x: -4.5, y: -3, w: 9, h: 6 },
          // A SMALL ETALON, because these panes are small. The host's own is sized for one scene
          // filling a page; four of them share that page here, and at the house etalon a nine-unit
          // desk is wider than its quarter of the screen and a reader sees a crop. (The camera page
          // pins 1 for the opposite reason: its zone is a thousand units across.) Small enough that
          // the desk fits a pane TURNED as well as square-on: a seat at the side sees a nine-unit
          // desk standing up in a landscape pane, and that is the tighter of the two fits.
          unit: 34,
          turn: AROUND[seat]!.turn,
          pitch,
          claims: draggable,
          start: { at: { x: 0, y: 0 }, zoom: 1 },
        },
      });
      const tag = document.createElement("div");
      tag.style.cssText =
        "position:absolute;left:8px;top:6px;z-index:2;font:600 11px ui-monospace,monospace;letter-spacing:.08em;opacity:.7;pointer-events:none";
      tag.textContent = seat;
      pane.appendChild(built.el);
      pane.appendChild(tag);
      wall.appendChild(pane);
    }
    return wall;
  },
  args: { screens: 4, handCards: 4, pitch: 24, feltPaint: "panelBg", facePaint: "accent" },
  argTypes: {
    screens: documented("arg.screens", { control: { type: "number", min: 2, max: 4, step: 1 } }, "the wall"),
    handCards: documented("arg.handCards", { control: { type: "number", min: 1, max: 6, step: 1 } }, "each hand/container"),
    pitch: documented("arg.pitch", { control: { type: "number", min: 0, max: 60, step: 2 } }, "every camera"),
    feltPaint: documented("arg.fill", PAINT, "desk/surface"),
    facePaint: documented("arg.fill", PAINT, "cards/surface"),
  },
  parameters: { gkDocStory: "canvasSeats.table" },
};
