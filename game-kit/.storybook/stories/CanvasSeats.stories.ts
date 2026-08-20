import type { Meta, StoryObj } from "@storybook/html";
import {
  Acceptor,
  add,
  applyMove,
  Bounded,
  byId,
  Container,
  draggable,
  Draggable,
  extentOf,
  Flippable,
  footprint,
  freeLayout,
  Grabber,
  installStockFlips,
  installStockGrabs,
  installStockGrains,
  installStockLayouts,
  compose,
  fieldsOf,
  keep,
  node,
  planMove,
  Poser,
  Private,
  project,
  rect,
  registerLayout,
  registerSurface,
  rowLayout,
  Surfaced,
  Transformable,
  type Node,
  type TransformableFields,
  type Vec,
} from "../../src/index.js";
import { scene, type Scene } from "../devtools/scene.js";
import { wireDrag } from "../devtools/drag.js";
import { localMaster, type Master } from "../devtools/master.js";
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
  west: { at: { x: -2.7, y: 0 }, turn: -90 },
  north: { at: { x: 0, y: -2.1 }, turn: 180 },
  east: { at: { x: 2.7, y: 0 }, turn: 90 },
};

const FELT = "story.seats.felt";
const FACE = "story.seats.face";
const BACK = "story.seats.back";
const PILE = "story.seats.pile";

const PAINT = { control: "select", options: PAINTS };

interface SeatsArgs {
  screens: number;
  handCards: number;
  others: string;
  latency: number;
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
function board(seats: readonly string[], handCards: number, others: string): Node {
  const desk = node(
    "desk",
    Bounded({ bounds: rect(9, 6) }),
    Container({ layout: "story.seats.free" }),
    Surfaced({ surface: FELT }),
  );
  // The shared middle: everyone sees this, from their own side.
  const pile = node(
    "pile",
    Bounded({ bounds: rect(1.6, 2 ) }),
    Container({ layout: "story.seats.free" }),
    Surfaced({ surface: PILE }),
    Transformable({ at: { x: 0, y: 0 } }),
    Acceptor({ accept: { and: [] } }),
    Grabber({ grab: "one" }),
    // The middle is open: whatever lands here lies face up for the whole desk.
    Poser({ side: keep(), others: "same" }),
  );
  add(desk, pile);
  for (const seat of seats) {
    const hand = node(
      `hand:${seat}`,
      Bounded({ bounds: rect(3.2, 1.4) }),
      Container({ layout: "story.seats.row" }),
      Transformable({ at: AROUND[seat]!.at }),
      Acceptor({ accept: { and: [] } }),
      Grabber({ grab: "one" }),
      // NOT private any more, and that is the lesson: the hand is in everyone's picture, and what
      // differs between seats is only which SIDE of its cards they are shown.
      Poser({ side: keep(), others, owner: seat }),
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

/**
 * THE TRUTH, KEPT ACROSS RE-RENDERS while its shape is unchanged.
 *
 * Storybook calls the story again for every control, and a board rebuilt each time would forget
 * every card anyone had moved — the desk would reset itself whenever a reader touched the pitch.
 * So the board is rebuilt only when the SHAPE changes: how many seats, how many cards, which rule.
 * That is client2's `deps` under another name, and it is the same reason the scene shell keeps its
 * host: an argument change is new data, not a new world.
 */
let standing: { key: string; master: Master } | undefined;

function masterFor(seats: readonly string[], handCards: number, others: string, latency: number): Master {
  const key = `${seats.join(",")}|${handCards}|${others}`;
  if (standing?.key !== key) {
    standing?.master.dispose();
    standing = { key, master: localMaster(board(seats, handCards, others), latency) };
  }
  standing.master.retune(latency); // live, like every other knob: the same master, a new number
  return standing.master;
}

/** Where a zone stands on the desk. The desk is an unposed free layout: its space IS root space. */
const zoneHome = (zone: Node): Vec => fieldsOf<TransformableFields>(zone, "Transformable")?.at ?? { x: 0, y: 0 };

/**
 * Which zone the finger let go over — the scene's own knowledge, which is why the wiring asks for
 * it rather than picking: a plain pick answers with the topmost thing DRAWN, and over a hand that
 * is a card.
 */
function zoneAt(root: Node, at: Vec): Node | undefined {
  return root.children.find((zone) => {
    const box = footprint(zone);
    if (!box) return false;
    const { w, h } = extentOf(box);
    const home = zoneHome(zone);
    return Math.abs(at.x - home.x) <= w / 2 && Math.abs(at.y - home.y) <= h / 2;
  });
}

export const Table: StoryObj<SeatsArgs> = {
  render: ({ screens, handCards, others, latency, pitch, feltPaint, facePaint }) => {
    installStockLayouts();
    installStockGrabs();
    installStockGrains();
    // Without the flip recipe a card at odd parity still paints its face: the side would be true
    // in the tree and invisible on the glass.
    installStockFlips();
    registerLayout("story.seats.free", freeLayout);
    registerLayout("story.seats.row", rowLayout({ gap: 0.08 }));
    registerSurface(FELT, { layers: [{ paint: feltPaint }], radius: 0.3 });
    registerSurface(FACE, { layers: [{ paint: facePaint }], radius: 0.08 });
    registerSurface(BACK, { layers: [{ paint: "textMuted" }], radius: 0.08 });
    registerSurface(PILE, { layers: [{ paint: "sunkBg" }], radius: 0.12 });

    const seats = SEATS.slice(0, Math.max(2, Math.min(4, Math.round(screens))));
    const master = masterFor(seats, handCards, others, latency);
    const truth = master.truth();

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
      // THE MOVE IS PROPOSED, NOT PERFORMED. The tree under this glass is a projection: a drop
      // resolved here alone would be real for one pair of eyes and would never have happened for
      // the others. So the finger sends a message to the master, and the board everyone shares is
      // what moves — after the delay, and again after the echo.
      //
      // Returning FALSE on purpose: the wiring then makes its ordinary local drop, which is the
      // optimistic PREDICTION — the card lands under the finger at once, and the authoritative
      // snapshot either confirms it or takes it away. Position is reversible, so predicting it is
      // safe; that is the design's own line about what may be predicted and what may not.
      const mate = master.join(seat);
      mate.onState((seen) => built.setRoot(seen));
      wireDrag(built, {
        zoneAt,
        view: () => built.camera?.transform() ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        onDrop: ({ lead, target, seat: at }) => {
          const zone = byId(truth, target.id);
          if (!lead.parent || !zone) return false;
          const home = zoneHome(zone);
          mate.send({
            source: lead.parent.id,
            touched: lead.id,
            target: target.id,
            at: { x: at.x - home.x, y: at.y - home.y },
            actor: seat,
          });
          return false;
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
  args: { screens: 4, handCards: 4, others: "back", latency: 0, pitch: 24, feltPaint: "panelBg", facePaint: "accent" },
  argTypes: {
    screens: documented("arg.screens", { control: { type: "number", min: 2, max: 4, step: 1 } }, "the wall"),
    handCards: documented("arg.handCards", { control: { type: "number", min: 1, max: 6, step: 1 } }, "each hand/container"),
    others: documented("arg.grainOthers", { control: "select", options: ["same", "back", "opposite"] }, "each hand/poser"),
    latency: documented("arg.latency", { control: { type: "number", min: 0, max: 1500, step: 50 } }, "the master"),
    pitch: documented("arg.pitch", { control: { type: "number", min: 0, max: 60, step: 2 } }, "every camera"),
    feltPaint: documented("arg.fill", PAINT, "desk/surface"),
    facePaint: documented("arg.fill", PAINT, "cards/surface"),
  },
  parameters: { gkDocStory: "canvasSeats.table" },
};
