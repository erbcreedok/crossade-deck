import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  Acceptor,
  add,
  applyMove,
  Bounded,
  Container,
  Draggable,
  derive,
  down,
  Flippable,
  Grabber,
  installStockFlips,
  installStockGrabs,
  installStockGrains,
  keep,
  node,
  planMove,
  Poser,
  rect,
  registerSurface,
  Surfaced,
  Transformable,
  up,
  type GrainRule,
  type Node,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { checks, gap, imagesDiffer, inkOf, painted, pixelAt, settled, snapshot, standing, type CheckContext } from "../devtools/checks.js";

// THE REST POSE, ON THE GLASS. The unit suite states what a zone answers about an arriving load;
// this rung proves the answer LANDS — that a plan resolved into `angle` and `side` moves the paint.
//
// The card is a 1×1.4 quad, taller than wide, and every claim is read off the ink's bounding box or
// off whole frames compared with each other. A turn shows up in the box because a rotated rectangle
// needs a bigger one to hold it; a side shows up as a different picture, because the two faces are
// painted in different colours. Neither reading knows anything about the resolver's arithmetic.
//
// Installed here as an ordinary consumer would: the grabs a plan reads, the grains a zone's rules
// name, and the flip recipe that makes a turned card show its back.
installStockGrabs();
installStockGrains();
installStockFlips();

const FACE = "tests.pose.face";
const BACK = "tests.pose.back";

interface PoseArgs {
  id: string;
}

const meta: Meta<PoseArgs> = {
  title: "Tests/Pose",
  parameters: { gkDoc: "tests.pose" },
  argTypes: { id: { control: "text" } },
  args: { id: "card" },
};
export default meta;

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

/** The glass as ink over the corner reading — the background is measured, never assumed. */
function ink(glass: HTMLCanvasElement) {
  return inkOf(snapshot(glass), pixelAt(glass, 0.02, 0.02));
}
const widthOf = (b: ReturnType<typeof ink>) => b.maxX - b.minX;
const heightOf = (b: ReturnType<typeof ink>) => b.maxY - b.minY;

/**
 * A desk holding one card, DROPPED — not placed. The card starts in a source pile, the drop is
 * planned and carried out, and what the reader sees is wherever the target's rules put it.
 *
 * The turn is handed over as `carried`, which is the honest shape: 15° under a finger is in flight,
 * owned by the gesture, on no node at all until the drop commits it.
 */
function tree(id: string, rules: { angle?: GrainRule; side?: GrainRule }, carriedAngle = 15): Node {
  registerSurface(FACE, { layers: [{ paint: "accent" }] });
  registerSurface(BACK, { layers: [{ paint: "sunkBg" }] });
  const desk = node("desk", Container({ layout: "free" }));
  const source = node("source", Container({ layout: "free" }), Grabber({ grab: "one" }));
  const target = node(
    "target",
    Container({ layout: "free" }),
    Acceptor({ accept: { and: [] } }),
    Poser(rules),
  );
  const card = node(
    id.trim() || "card",
    Bounded({ bounds: rect(1, 1.4) }),
    Surfaced({ surface: FACE }),
    Transformable({}),
    Flippable({ flip: "turnOver", back: BACK }),
    Draggable({ onReject: "home" }),
  );
  add(source, card);
  add(desk, source);
  add(desk, target);
  const req = { source, touched: card, target, carried: { angle: carriedAngle } };
  applyMove(req, planMove(req));
  return desk;
}

export const Rest: StoryObj<PoseArgs> = {
  args: { id: "card" },
  parameters: { gkDocStory: "tests.pose.rest", controls: { include: ["id"] } },
  render: ({ id }) => scene(tree(id, { angle: keep() })).el,
  play: checks([
    {
      name: "play.pose.a-keep-zone-holds-the-turn — 15° under the finger is 15° on the desk",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // Straight first, as the ruler: the box the card fills when it is not turned at all.
        live.setRoot(tree(id, { angle: keep() }, 0));
        await settled();
        const straight = ink(glass);
        // The same card, dropped on the same rules with 15° in flight. A turned rectangle needs a
        // BIGGER box to hold it — both sides grow, which no other field does at once.
        live.setRoot(tree(id, { angle: keep() }, 15));
        await settled();
        const turned = ink(glass);
        await expect(
          widthOf(turned),
          `turned ${Math.round(widthOf(turned))}px wide · straight ${Math.round(widthOf(straight))}px`,
        ).toBeGreaterThan(widthOf(straight) * 1.1);
        await expect(heightOf(turned)).toBeGreaterThan(heightOf(straight));
      },
    },
    {
      name: "play.pose.a-derive-zone-straightens-it — the arrangement dictates, the flight is lost",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // The ruler again: a card that never turned.
        live.setRoot(tree(id, { angle: keep() }, 0));
        await settled();
        const straight = ink(glass);
        // The SAME 15° in flight, dropped on a zone that derives. No registered arrangement has an
        // opinion about a turn, and for a grid that reads "straight" — so the 15° are dropped at the
        // door and the box comes out the size it would have been with no gesture at all.
        live.setRoot(tree(id, { angle: derive() }, 15));
        await settled();
        const derived = ink(glass);
        await expect(...gap("width", widthOf(derived), widthOf(straight))).toBeLessThan(Math.max(2, widthOf(straight) * 0.04));
        await expect(...gap("height", heightOf(derived), heightOf(straight))).toBeLessThan(Math.max(2, heightOf(straight) * 0.04));
      },
    },
    {
      name: "play.pose.a-stamp-zone-turns-the-card-over — the side is a grain of the same pose",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // One card, one drop, two zones that differ in a single line of data. Face up and face down
        // are painted in different colours, so the claim is simply that the frames differ — no pixel
        // is picked by hand, and the reading survives any change to where the card sits.
        live.setRoot(tree(id, { angle: derive(), side: up() }, 0));
        await settled();
        const face = snapshot(glass);
        live.setRoot(tree(id, { angle: derive(), side: down() }, 0));
        await settled();
        const back = snapshot(glass);
        await expect(imagesDiffer(face, back), "a stamped side repaints the card").toBe(true);
        // And it is the RULE that did it, not the drop: stamping `up` again brings the face back,
        // which a one-way turn or a stuck parity would fail.
        live.setRoot(tree(id, { angle: derive(), side: up() }, 0));
        await settled();
        await expect(imagesDiffer(face, snapshot(glass)), "stamping up again is the face again").toBe(false);
      },
    },
  ]),
};
