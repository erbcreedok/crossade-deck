import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  Acceptor,
  add,
  apply,
  applyMove,
  Bounded,
  Container,
  Draggable,
  derive,
  down,
  Flippable,
  Grabber,
  installStockCarries,
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
  viewTransform,
  type GrainRule,
  type Node,
  type Point,
  type Vec,
} from "../../src/index.js";
import { scene, type Scene } from "../devtools/scene.js";
import { wireDrag } from "../devtools/drag.js";
import { checks, gap, imagesDiffer, inkOf, painted, pixelAt, settled, snapshot, standing, waitFor, type CheckContext } from "../devtools/checks.js";

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
installStockCarries();

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

// ── the drop a FINGER makes ───────────────────────────────────────────────────────────────────
//
// Everything above resolves a pose and applies it from code. This last rung asks the other half of
// the question: does a hand reach it. The catalog's drag wiring is asked for a zone under the point
// it let go over, and the drop goes through the same `planMove` + `applyMove` — so what a reader
// does with a finger and what the suite above does with a call are one path, not two.
//
// The zones here paint NOTHING on purpose: a zone is a box and a rule, and `Bounded` draws not one
// pixel. That leaves the card as the only ink on the glass, so its box is readable without picking
// a colour out of a crowd.

const ZONE = { w: 2.2, h: 2.6 };
const LEFT: Point = { x: -1.5, y: 0 };
const RIGHT: Point = { x: 1.5, y: 0 };

/**
 * Wait for the glass to go QUIET and STAY quiet. `settled()` is two frames flat, which is right for
 * a still scene and nowhere near a settle: one identical pair can also be the gap before a flight
 * scheduled this tick has drawn its first moving frame. Four in a row outlast that gap.
 */
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

/** A unit point as canvas fractions (for `pixelAt`) and client coordinates (for a pointer). */
function spot(live: Scene, u: Point): { fx: number; fy: number; cx: number; cy: number } {
  const v = live.host.viewport();
  const g = apply(viewTransform(live.host.unit(), v.width, v.height), u);
  const r = live.host.view.getBoundingClientRect();
  return { fx: g.x / v.width, fy: g.y / v.height, cx: r.left + g.x, cy: r.top + g.y };
}

function pointer(view: HTMLCanvasElement, type: string, s: { cx: number; cy: number }): void {
  view.dispatchEvent(new PointerEvent(type, { clientX: s.cx, clientY: s.cy, pointerId: 9, bubbles: true }));
}

/** Which zone the release happened over — the scene's own knowledge, as the wiring requires. */
function zoneAt(root: Node, at: Vec): Node | undefined {
  return root.children.find(
    (z) =>
      Math.abs(at.x - (z.id === "left" ? LEFT.x : RIGHT.x)) <= ZONE.w / 2 && Math.abs(at.y) <= ZONE.h / 2,
  );
}

/** Two zones and a card in the left one. Only the right zone declares a rule. */
function desk(rules: { angle?: GrainRule; side?: GrainRule }, cardAngle: number): Node {
  registerSurface(FACE, { layers: [{ paint: "accent" }] });
  registerSurface(BACK, { layers: [{ paint: "sunkBg" }] });
  const root = node("desk", Container({ layout: "free" }));
  const left = node(
    "left",
    Bounded({ bounds: rect(ZONE.w, ZONE.h) }),
    Container({ layout: "free" }),
    Transformable({ at: LEFT }),
    Acceptor({ accept: { and: [] } }),
    Grabber({ grab: "one" }),
  );
  const right = node(
    "right",
    Bounded({ bounds: rect(ZONE.w, ZONE.h) }),
    Container({ layout: "free" }),
    Transformable({ at: RIGHT }),
    Acceptor({ accept: { and: [] } }),
    Grabber({ grab: "one" }),
    Poser(rules),
  );
  const card = node(
    "card",
    Bounded({ bounds: rect(1, 1.4) }),
    Surfaced({ surface: FACE }),
    // ITS OWN SEAT INSIDE THE ZONE, which is the middle: poses compose down the chain, and a card
    // given the zone's own `at` as well would sit two zone-widths away from where the eye expects.
    Transformable({ at: { x: 0, y: 0 }, angle: cardAngle }),
    Flippable({ flip: "turnOver", back: BACK }),
    Draggable({ onReject: "home" }),
  );
  add(left, card);
  add(root, left);
  add(root, right);
  return root;
}

/** Carry the card from the left zone to the right one with one finger, and wait for the glass. */
async function carryAcross(live: Scene, glass: HTMLCanvasElement): Promise<void> {
  const from = spot(live, LEFT);
  const to = spot(live, RIGHT);
  // WAIT FOR THE CARD TO BE THERE BEFORE REACHING FOR IT — and wait for QUIET, not for a position.
  // A fresh tree is not a fresh picture: the clock is still easing the previous check's card home,
  // and the pick reads what is DRAWN. Watching for "the ink is on the left" is not enough, because
  // a card two thirds of the way home is already on the left and still moving; the finger then
  // closes on a seat the card has not arrived at, and the whole gesture is a grab of bare desk.
  await calm(glass);
  pointer(live.host.view, "pointerdown", from);
  for (let i = 1; i <= 8; i += 1) {
    pointer(live.host.view, "pointermove", { cx: from.cx + ((to.cx - from.cx) * i) / 8, cy: from.cy });
    await settled();
  }
  pointer(live.host.view, "pointerup", to);
  const bg = pixelAt(glass, 0.02, 0.02);
  await waitFor(
    () => (inkOf(snapshot(glass), bg).minX > (glass.width * 4) / 10 ? true : null),
    "the card never came to rest in the right-hand zone",
  );
  // AND QUIET AGAIN, for the same reason as above and one more: the settle eases the TURN too, so
  // a card measured the moment it arrives in the zone is photographed part-way between the angle
  // the carry held it at and the one the zone resolved. Read too early, every rule looks like
  // `derive`.
  await calm(glass);
}

export const Drop: StoryObj<PoseArgs> = {
  args: { id: "card" },
  parameters: { gkDocStory: "tests.pose.drop", controls: { include: ["id"] } },
  render: () => wireDrag(scene(desk({ angle: derive() }, 30), { animate: true }), { zoneAt }).el,
  play: checks([
    {
      name: "play.pose.a-finger-lands-the-drop — the card changes zone, and the rule acts on landing",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        // A card turned 30°, carried into a zone that DERIVES the turn. It has to arrive on the
        // right AND come out straight: the same 1:1.4 box it would have had if no finger had ever
        // turned it, which is the whole of `derive` seen from the outside.
        live.setRoot(desk({ angle: derive() }, 30));
        await settled();
        const before = ink(glass);
        await expect(before.maxX, "the card starts on the left").toBeLessThan(glass.width / 2);
        await carryAcross(live, glass);
        const derived = ink(glass);
        await expect(
          widthOf(derived) / heightOf(derived),
          `derived box ${Math.round(widthOf(derived))}×${Math.round(heightOf(derived))}`,
        ).toBeLessThan(0.78);
      },
    },
    {
      name: "play.pose.a-keep-zone-lets-the-carried-turn-land — the same gesture, one word of data apart",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        // The counter-reading, and the reason the one above means anything: change `derive` to
        // `keep` and nothing else, make the identical gesture, and the 30° survive the landing.
        live.setRoot(desk({ angle: keep() }, 30));
        await settled();
        await carryAcross(live, glass);
        const kept = ink(glass);
        await expect(
          widthOf(kept) / heightOf(kept),
          `kept box ${Math.round(widthOf(kept))}×${Math.round(heightOf(kept))}`,
        ).toBeGreaterThan(0.85);
      },
    },
  ]),
};
