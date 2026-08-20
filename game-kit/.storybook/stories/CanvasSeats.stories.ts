import type { Meta, StoryObj } from "@storybook/html";
import {
  Acceptor,
  add,
  circle,
  Coated,
  applyMove,
  Bounded,
  byId,
  cloneTree,
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
  installStockCoats,
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
  t,
  Transformable,
  walk,
  type Node,
  type NodeId,
  type Paint,
  type TransformableFields,
  type Vec,
} from "../../src/index.js";
import { scene, type Scene } from "../devtools/scene.js";
import { wireDrag } from "../devtools/drag.js";
import { localMaster, MAX_OPEN, type Master, type Waiting } from "../devtools/master.js";
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
      // THE RULE FROM THE SCENARIO, as one literal: my own hand takes it, someone else's asks. It
      // is a rule and not a runtime branch on purpose — written here it travels, and every client
      // resolves the same verdict for the same drop.
      Acceptor({ accept: { or: [{ eq: ["actor.seat", "target.owner"] }, { ask: { and: [] } }] } }),
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
    const truth = board(seats, handCards, others);
    // The middle is the public part of this desk: a hand carried over it is a hand everyone may
    // watch. Which zone counts as public is the game's knowledge, so the master is told.
    const open = (at: { x: number; y: number }): boolean => zoneAt(truth, at)?.id === "pile";
    standing = { key, master: localMaster(truth, latency, MAX_OPEN, open) };
  }
  standing.master.retune(latency); // live, like every other knob: the same master, a new number
  return standing.master;
}

/** Somebody else's hand on this desk: whose it is, and where — when the master let the point through. */
interface Hand {
  readonly actor: string;
  readonly at?: Vec;
}

/** How high a card stands while it waits on somebody's word — off the desk, and plainly not landed. */
const WAITING_LIFT = 0.6;

const DOT = "story.seats.dot";
const GHOST = "story.seats.ghost";

/**
 * A SEAT'S OWN COLOUR, as one name and one number. `spin` is the hue wheel the kit ships for exactly
 * this: N players are N params of one recipe, not N records and never N hexes — and a client could
 * remap the whole wheel (a colour-blind palette) without a thing changing on the wire.
 */
const inkOf = (seat: string): Paint => ({ token: "spin", param: SEATS.indexOf(seat as never) / SEATS.length });
/** Three of them, a fifth of a unit apart, sitting across the middle of whatever is waiting. */
const DOTS = [-0.2, 0, 0.2];

/**
 * MARK WHAT IS WAITING — three dots on the card, and a ring on the zone the question stands at.
 *
 * DOTS AND NOT A SPINNER, and that is the whole of the choice: dots read as "somebody is deciding",
 * a spinner reads as "something is loading". The wait here is a PERSON, and the canon reserves the
 * indicator for exactly that — a machine round trip is waited out in silence.
 *
 * They are NODES and not a coat, because a coat differs by render SHAPE — a fill, a stroke, a mask —
 * and three separate marks are not one of those. As children they inherit the card's pose for free,
 * which is what keeps them on it while it is carried, lifted or turned.
 *
 * Written into the PROJECTION, never the truth: waiting is a thing a viewer is shown.
 */
function mark(snapshot: Node, wait: Waiting, others: ReadonlyMap<NodeId, Hand> = new Map()): Node {
  // A COPY, because marks come OFF as well as on. A ring composed onto the snapshot itself would
  // outlive the hand that put it there: the next pass simply does not mention that node, and what
  // was never removed stays. Marking a fresh tree each time makes absence mean absence.
  const seen = cloneTree(snapshot);
  registerSurface(DOT, { layers: [{ paint: "text" }] });
  registerSurface(GHOST, { layers: [{ paint: "textMuted" }], radius: 0.08 });
  walk(seen, (n) => {
    // SOMEBODY ELSE'S HAND IS ON THIS. The ring says whose finger; the point, when the master let it
    // through, says where. Over a secret hand there is no point to have — the table learns THAT a
    // card is being dragged and never where, which is the whole of the cut.
    const hand = others.get(n.id);
    if (hand) compose(n, Coated({ self: { recipe: "ring", level: 1, tint: inkOf(hand.actor) } }));
    if (wait.zones.has(n.id)) compose(n, Coated({ self: { recipe: "ring", level: 0.9, tint: "accent" } }));
    if (!wait.held.has(n.id)) return;
    // OFF THE DESK while it waits: not flown home, which would read as a refusal, and not landed,
    // which would read as a consent nobody gave. Raised is the third thing, and it is the true one.
    const own = fieldsOf<TransformableFields>(n, "Transformable");
    if (own) compose(n, Transformable({ ...own, z: own.z + WAITING_LIFT }));
    DOTS.forEach((dx, i) =>
      add(
        n,
        node(`${n.id}~dot${i}`, Bounded({ bounds: circle(0.055) }), Surfaced({ surface: DOT }), Transformable({ at: { x: dx, y: 0 } })),
      ),
    );
  });
  // THE PHANTOM, and it is a NODE OF ITS OWN rather than the card moved. A card in an arranged zone
  // is placed by the arrangement — write its `at` and the row simply puts it back — and the card is
  // not where the finger is anyway: it is still in the hand until a move is agreed. What travels is
  // a picture of a hand, so a picture is what is drawn, in the colour of whoever is holding it.
  for (const [id, hand] of others) {
    if (!hand.at) continue; // the master cut the point: the table knows THAT, and never where
    add(
      seen,
      node(
        `~hand:${id}`,
        Bounded({ bounds: rect(0.8, 1.12) }),
        Surfaced({ surface: GHOST }),
        Coated({ self: { recipe: "ring", level: 1, tint: inkOf(hand.actor) } }),
        Transformable({ at: hand.at, z: WAITING_LIFT }),
      ),
    );
  }
  return seen;
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
    installStockCoats();
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
      // OTHER HANDS ON THE DESK. Ephemeral: a map that is not truth, not saved and not projected —
      // it is redrawn under the newest snapshot and forgotten the moment a hand lets go.
      const others = new Map<NodeId, Hand>();
      let latest: { seen: Node; wait: Waiting } | undefined;
      const redraw = (): void => {
        if (latest) built.setRoot(mark(latest.seen, latest.wait, others));
      };
      mate.onCarry((carry) => {
        for (const id of carry.els) {
          if (carry.done) others.delete(id);
          else others.set(id, carry.at ? { actor: carry.actor, at: carry.at } : { actor: carry.actor });
        }
        redraw();
      });
      mate.onState((seen, wait) => {
        latest = { seen, wait };
        built.setRoot(mark(seen, wait, others));
        // A question is over the moment the board moves: granted, refused, withdrawn or simply out
        // of time — all four end the same way here, because the panel is a VIEW of an open request
        // and not a state of its own.
        pane.querySelector("[data-ask]")?.remove();
      });
      // WHO ASKS AND HOW IS THE CONSUMER'S BUSINESS — the kit hands over the record and the two
      // answers, and this is one consumer's answer: two buttons in the corner of the seat being
      // asked. A game would put them in its HUD; a bot would answer without drawing anything.
      mate.onAsk((question) => {
        pane.querySelector("[data-ask]")?.remove();
        const panel = document.createElement("div");
        panel.setAttribute("data-ask", question.id);
        panel.style.cssText =
          "position:absolute;left:8px;bottom:8px;z-index:3;display:flex;gap:6px;align-items:center;" +
          `padding:6px 8px;border-radius:8px;background:${t("panelBg")};color:${t("text")};` +
          "font:600 11px ui-monospace,monospace";
        const said = document.createElement("span");
        said.textContent = `${question.actor} · ${question.els.length}`;
        said.style.cssText = "opacity:.75;letter-spacing:.06em";
        panel.appendChild(said);
        for (const [word, label] of [["granted", "✓"], ["refused", "✕"]] as const) {
          const b = document.createElement("button");
          b.textContent = label;
          b.style.cssText =
            `cursor:pointer;border:0;border-radius:6px;padding:2px 8px;background:${t("sunkBg")};color:${t("text")};` +
            "font:600 12px ui-monospace,monospace";
          b.addEventListener("click", () => {
            panel.remove();
            mate.reply(question.id, word);
          });
          panel.appendChild(b);
        }
        pane.appendChild(panel);
      });
      wireDrag(built, {
        zoneAt,
        view: () => built.camera?.transform() ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        onCarry: ({ ids, at, done }) => mate.carry({ els: ids, at, done }),
        onDrop: ({ lead, target, seat: at }) => {
          const zone = byId(truth, target.id);
          const from = lead.parent;
          if (!from || !zone) return false;
          const home = zoneHome(zone);
          mate.send({
            source: from.id,
            touched: lead.id,
            target: target.id,
            at: { x: at.x - home.x, y: at.y - home.y },
            actor: seat,
          });
          // WHAT MAY BE PREDICTED AND WHAT MAY NOT. A move that only needs the board to agree is
          // predicted at once: position is reversible, and a card taken back reads as an answer.
          // A move short of AUTHORITY is not — nobody has said yes yet, and showing it landed would
          // be showing a permission that was never given.
          const asks = planMove({ source: from, touched: lead, target, seat }).verdict === "ask";
          if (!asks) return false;
          // Taking the drop over is the whole of it: the card is NOT moved and NOT flown home — it
          // stays where it was, and `mark` raises it off the desk on the authoritative snapshot.
          // Writing the lift here instead would last until the echo and no longer.
          return true;
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
