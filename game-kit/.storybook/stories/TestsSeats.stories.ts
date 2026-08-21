import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  Acceptor,
  add,
  Bounded,
  Container,
  Draggable,
  Flippable,
  freeLayout,
  Grabber,
  installStockCarries,
  installStockFlips,
  installStockGrabs,
  installStockGrains,
  keep,
  node,
  Poser,
  project,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  type Node,
  type Vec,
} from "../../src/index.js";
import { scene, type Scene } from "../devtools/scene.js";
import { wireDrag } from "../devtools/drag.js";
import { localMaster } from "../devtools/master.js";
import { checks, imagesDiffer, snapshot, settled, waitFor, type CheckContext } from "../devtools/checks.js";

// ONE BOARD, TWO SCREENS, AND A FINGER — the claim the whole live table rests on, made on real glass.
//
// The master has its own suite and it is a good one, but every line of it is about DELIVERY: who
// hears what, in which order, after how long. None of it can say that a hand moving on one screen
// is a hand moving on the OTHER one, because that sentence is about pixels. This rung says it.
//
// The control matters as much as the claim: a gesture that lands on nothing must leave the far
// screen alone. Without it "the picture changed" proves only that something redrew.

installStockGrabs();
installStockGrains();
installStockFlips();
installStockCarries();

const FELT = "tests.seats.felt";
const FACE = "tests.seats.face";
const BACK = "tests.seats.back";
const SEATS = ["south", "west"] as const;
const MIDDLE: Vec = { x: 0, y: 0 };
const HAND: Vec = { x: 0, y: 2 };

interface SeatsArgs {
  id: string;
}

const meta: Meta<SeatsArgs> = {
  title: "Tests/Seats",
  parameters: { gkDoc: "tests.seats" },
  argTypes: { id: { control: "text" } },
  args: { id: "card" },
};
export default meta;

/** The two screens standing right now, so a check can read the far one. */
let live: { seat: string; built: Scene }[] = [];

/** A desk with an open middle and one hand holding a single card. */
function board(): Node {
  const desk = node("desk", Bounded({ bounds: rect(8, 6) }), Container({ layout: "tests.seats.free" }), Surfaced({ surface: FELT }));
  const middle = node(
    "middle",
    Bounded({ bounds: rect(2, 2.4) }),
    Container({ layout: "tests.seats.free" }),
    Transformable({ at: MIDDLE }),
    Acceptor({ accept: { and: [] } }),
    Grabber({ grab: "one" }),
    Poser({ side: keep(), others: "same" }),
  );
  const hand = node(
    "hand",
    Bounded({ bounds: rect(2, 1.6) }),
    Container({ layout: "tests.seats.free" }),
    Transformable({ at: HAND }),
    Acceptor({ accept: { and: [] } }),
    Grabber({ grab: "one" }),
    Poser({ side: keep(), others: "same", owner: "south" }),
  );
  add(
    hand,
    node(
      "card",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: FACE }),
      Transformable({ at: { x: 0, y: 0 } }),
      Flippable({ flip: "turnOver", back: BACK }),
      Draggable({ onReject: "home" }),
    ),
  );
  add(desk, middle);
  add(desk, hand);
  return desk;
}

/** Which zone a point is over — the scene's own knowledge, as the wiring requires. */
function zoneAt(root: Node, at: Vec): Node | undefined {
  return root.children.find((z) => {
    const seat = z.id === "hand" ? HAND : MIDDLE;
    const half = z.id === "hand" ? { x: 1, y: 0.8 } : { x: 1, y: 1.2 };
    return Math.abs(at.x - seat.x) <= half.x && Math.abs(at.y - seat.y) <= half.y;
  });
}

function wall(): HTMLElement {
  registerLayout("tests.seats.free", freeLayout);
  registerSurface(FELT, { layers: [{ paint: "panelBg" }], radius: 0.2 });
  registerSurface(FACE, { layers: [{ paint: "accent" }], radius: 0.08 });
  registerSurface(BACK, { layers: [{ paint: "textMuted" }], radius: 0.08 });

  const master = localMaster(board());
  const truth = master.truth();
  const row = document.createElement("div");
  row.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;height:100%;min-height:320px";
  live = [];
  for (const seat of SEATS) {
    const pane = document.createElement("div");
    pane.style.cssText = "position:relative;min-height:280px";
    const built = scene(project(truth, seat), { key: `t.${seat}`, animate: true });
    const mate = master.join(seat);
    mate.onState((seen) => built.setRoot(seen));
    wireDrag(built, {
      zoneAt,
      onDrop: ({ lead, target, seat: at }) => {
        const from = lead.parent;
        if (!from) return false;
        const home = target.id === "hand" ? HAND : MIDDLE;
        mate.send({
          source: from.id,
          touched: lead.id,
          target: target.id,
          at: { x: at.x - home.x, y: at.y - home.y },
          actor: seat,
        });
        return false;
      },
    });
    pane.appendChild(built.el);
    row.appendChild(pane);
    live.push({ seat, built });
  }
  return row;
}

const glassOfSeat = (seat: string): HTMLCanvasElement =>
  live.find((s) => s.seat === seat)!.built.host.view;

/** A unit point as client coordinates on one seat's glass. */
function spotOn(seat: string, u: Vec): { cx: number; cy: number } {
  const s = live.find((x) => x.seat === seat)!;
  const v = s.built.host.viewport();
  const unit = s.built.host.unit();
  const r = s.built.host.view.getBoundingClientRect();
  return { cx: r.left + v.width / 2 + u.x * unit, cy: r.top + v.height / 2 + u.y * unit };
}

function finger(view: HTMLCanvasElement, type: string, at: { cx: number; cy: number }): void {
  view.dispatchEvent(new PointerEvent(type, { clientX: at.cx, clientY: at.cy, pointerId: 11, bubbles: true }));
}

/** Wait for a glass to stop changing — a settle is not two frames, and a carry is not one either. */
async function calm(glass: HTMLCanvasElement): Promise<void> {
  let prev = snapshot(glass);
  let streak = 0;
  await waitFor(() => {
    const now = snapshot(glass);
    streak = imagesDiffer(prev, now) ? 0 : streak + 1;
    prev = now;
    return streak >= 4 ? true : null;
  }, "the glass never went quiet");
}

/** Carry the card from the hand to `to`, on the south screen. */
async function carry(to: Vec): Promise<void> {
  const view = glassOfSeat("south");
  const from = spotOn("south", HAND);
  const end = spotOn("south", to);
  finger(view, "pointerdown", from);
  for (let i = 1; i <= 8; i += 1) {
    finger(view, "pointermove", { cx: from.cx + ((end.cx - from.cx) * i) / 8, cy: from.cy + ((end.cy - from.cy) * i) / 8 });
    await settled();
  }
  finger(view, "pointerup", end);
}

export const Live: StoryObj<SeatsArgs> = {
  parameters: { gkDocStory: "tests.seats.live", controls: { include: ["id"] } },
  render: () => wall(),
  play: checks([
    {
      name: "play.seats.a-move-on-one-screen-is-a-move-on-the-other",
      async run(_ctx: CheckContext) {
        const far = glassOfSeat("west");
        await calm(far);
        const before = snapshot(far);
        await carry(MIDDLE);
        await calm(far);
        // The finger touched ONE glass. The other one is a different host, a different canvas and a
        // different projection — the only thing they share is the board, which is the whole point.
        await expect(imagesDiffer(before, snapshot(far)), "the far screen saw the move").toBe(true);
      },
    },
    {
      name: "play.seats.a-gesture-that-lands-on-nothing-leaves-the-far-screen-alone",
      async run(_ctx: CheckContext) {
        // The control, and it is not a formality: without it the claim above proves only that
        // something redrew. Released over bare desk the card goes home, no message is sent, and the
        // other screen has nothing to hear.
        const far = glassOfSeat("west");
        await calm(far);
        const before = snapshot(far);
        await carry({ x: -3.2, y: -2.2 });
        await calm(far);
        await expect(imagesDiffer(before, snapshot(far)), "nothing happened, and it shows").toBe(false);
      },
    },
  ]),
};
