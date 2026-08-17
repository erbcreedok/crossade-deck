import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  apply,
  Bounded,
  byId,
  compose,
  Container,
  freeLayout,
  installStockShuffles,
  node,
  rect,
  registerLayout,
  registerSurface,
  reorder,
  rowLayout,
  Surfaced,
  Transformable,
  viewTransform,
  type Node,
  type Point,
} from "../../src/index.js";
import { currentSettings } from "../devtools/catalogSettings.js";
import { scene, type Scene } from "../devtools/scene.js";
import { checks, differs, imagesDiffer, painted, pixelAt, snapshot, standing, waitFor, type CheckContext } from "../devtools/checks.js";

// MOTION ON THE GLASS — the three claims no headless layer can make. The unit suite proves the
// clock's arithmetic on a fake clock; this rung proves the GPU shows it: that the viewer's speed 0
// really lands a move on the very next frame (no flight the eye could catch), that `retain` really
// leaves ink where a card WAS (a renderer that cleared would show desk), and that a shuffle really
// lands every card on its new seat, bit for bit against a row built in that order to begin with.

installStockShuffles();

const FACE = "tests.motion.face";
const LEFT = { x: -2, y: 0 };
const RIGHT = { x: 2, y: 0 };

const meta: Meta = {
  title: "Tests/Motion",
  parameters: { gkDoc: "tests.motion" },
};
export default meta;

function still(): Node {
  registerSurface(FACE, { layers: [{ paint: "accent" }] });
  registerLayout("tests.motion.free", freeLayout);
  const desk = node("desk", Container({ layout: "tests.motion.free" }));
  add(desk, node("card", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: FACE }), Transformable({ at: LEFT })));
  return desk;
}

/** A unit point as canvas fractions (for `pixelAt`). */
function spot(live: Scene, u: Point): { fx: number; fy: number } {
  const v = live.host.viewport();
  const g = apply(viewTransform(live.host.unit(), v.width, v.height), u);
  return { fx: g.x / v.width, fy: g.y / v.height };
}

/** Four identical frames in a row: the glass has gone quiet and stayed quiet (see Tests/Draggable). */
async function calm(glass: HTMLCanvasElement): Promise<void> {
  let prev = snapshot(glass);
  let streak = 0;
  await waitFor(() => {
    const current = snapshot(glass);
    streak = imagesDiffer(prev, current) ? 0 : streak + 1;
    prev = current;
    return streak >= 4 ? true : null;
  }, "the glass never went quiet");
}

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

export const Speed: StoryObj = {
  parameters: { gkDocStory: "tests.motion.speed" },
  // The onlooker's speed is 0 for THIS scene: the third argument is the viewer plane, and the
  // catalog's own header is not touched — a reader's ladder stays where they left it.
  render: () => scene(still(), { animate: true, motion: { settleMs: 1500 } }, { ...currentSettings(), viewer: { ...currentSettings().viewer, motionSpeed: 0 } }).el,
  play: checks([
    {
      name: "play.motion.speed-zero-snaps — at speed 0 a moved card is on its new seat next frame, never in between",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const bg = pixelAt(glass, 0.02, 0.02);
        const left = spot(live, LEFT);
        const right = spot(live, RIGHT);
        const between = spot(live, { x: 0, y: 0 });
        await expect(differs(pixelAt(glass, left.fx, left.fy), bg), "the card rests on the left").toBe(true);
        // Move it in the tree: a 1500 ms settle is asked, and speed 0 lands it at once.
        compose(byId(live.host.root, "card")!, Transformable({ at: RIGHT }));
        live.host.setRoot(live.host.root);
        // Within a couple of frames it is on the right — and the middle of the desk NEVER shows it.
        let sawMiddle = false;
        await waitFor(() => {
          if (differs(pixelAt(glass, between.fx, between.fy), bg)) sawMiddle = true;
          return differs(pixelAt(glass, right.fx, right.fy), bg) ? true : null;
        }, "the card never reached the right");
        await expect(sawMiddle, "at speed 0 the card was seen mid-flight").toBe(false);
        await calm(glass);
        await expect(differs(pixelAt(glass, left.fx, left.fy), bg), "the left seat is bare").toBe(false);
      },
    },
  ]),
};

export const Retain: StoryObj = {
  parameters: { gkDocStory: "tests.motion.retain" },
  render: () => scene(still(), { animate: true }).el,
  play: checks([
    {
      name: "play.motion.retain-keeps-the-glass — with retain on, ink stays where the launched card was",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const bg = pixelAt(glass, 0.02, 0.02);
        const left = spot(live, LEFT);
        // A point on the card's way up — a unit and a half above its seat, in the trail's column.
        const trail = spot(live, { x: LEFT.x, y: LEFT.y - 1.6 });
        await expect(differs(pixelAt(glass, left.fx, left.fy), bg), "the card rests on the left").toBe(true);
        await expect(differs(pixelAt(glass, trail.fx, trail.fy), bg), "the trail spot is bare desk before").toBe(false);
        live.motions!.retain(true);
        // Straight up and fast: the card leaves its seat at once and is gone within a second.
        let gone = false;
        live.motions!.launch("card", { speed: 12, angle: 270, gravity: 4, onDone: () => { gone = true; } });
        await waitFor(() => (gone ? true : null), "the card never left the glass", 6000);
        // The seat it LEFT still carries its ink, and so does the way it went: nothing was cleared
        // and nothing at rest was repainted while retaining.
        await expect(differs(pixelAt(glass, left.fx, left.fy), bg), "the seat's ink was cleared").toBe(true);
        await expect(differs(pixelAt(glass, trail.fx, trail.fy), bg), "the trail was cleared").toBe(true);
        live.motions!.retain(false);
        // Off again, the frame repaints in full: the card is back home (it eased there) and the
        // trail is desk again.
        await calm(glass);
        await expect(differs(pixelAt(glass, left.fx, left.fy), bg), "the card is home").toBe(true);
        await expect(differs(pixelAt(glass, trail.fx, trail.fy), bg), "the trail is gone once retain is off").toBe(false);
      },
    },
  ]),
};

const ROW = ["accent", "alert", "textMuted", "panelBg"] as const;

function row(order: readonly number[]): Node {
  registerLayout("tests.motion.free", freeLayout);
  registerLayout("tests.motion.row", rowLayout({ gap: 0.3 }));
  const desk = node("desk", Container({ layout: "tests.motion.free" }));
  const hand = node("hand", Container({ layout: "tests.motion.row" }), Transformable({ at: { x: 0, y: 0 } }));
  add(desk, hand);
  ROW.forEach((paint, i) => {
    registerSurface(`tests.motion.row.${i}`, { layers: [{ paint }], radius: 0.06 });
    add(hand, node(`c${i}`, Bounded({ bounds: rect(0.9, 1.3) }), Surfaced({ surface: `tests.motion.row.${i}` })));
  });
  reorder(hand, order);
  return desk;
}

export const Shuffle: StoryObj = {
  parameters: { gkDocStory: "tests.motion.shuffle" },
  render: () => scene(row([0, 1, 2, 3]), { animate: true, motion: { shuffleMs: 400 } }).el,
  play: checks([
    {
      name: "play.motion.shuffle-lands-in-order — after the choreography the row is bit-identical to one built in that order",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const before = snapshot(glass);
        const order = [3, 0, 2, 1];
        let committed = false;
        live.motions!.shuffle("hand", () => { reorder(byId(live.host.root, "hand")!, order); committed = true; }, { recipe: "riffle" });
        await waitFor(() => (committed ? true : null), "the shuffle never committed");
        await calm(glass);
        const after = snapshot(glass);
        await expect(imagesDiffer(before, after), "the row changed").toBe(true);
        // Feed the SAME row built in the landed order from scratch: no settle may follow (the
        // recipe returned every card to its exact seat), and the picture is the same, bit for bit.
        live.setRoot(row(order));
        await calm(glass);
        await expect(imagesDiffer(after, snapshot(glass)), "the landed row differs from one built in that order").toBe(false);
      },
    },
  ]),
};
