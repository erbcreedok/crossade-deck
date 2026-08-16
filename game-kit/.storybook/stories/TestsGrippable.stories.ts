import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  apply,
  Bounded,
  Container,
  Draggable,
  freeLayout,
  Grippable,
  grippableBy,
  installStockCarries,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  viewTransform,
  type Point,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene, type Scene } from "../devtools/scene.js";
import { checks, differs, imagesDiffer, painted, pixelAt, settled, snapshot, standing, waitFor, type CheckContext } from "../devtools/checks.js";

// THE GRIP ON THE GLASS. The unit suite states who may lift; this rung proves the FINGER obeys:
// the same synthetic pointer as the drag rung, judged from the seat "north". North's card
// follows the finger; south's hand refuses it pixel for pixel — the atom sits on the HAND, so
// the card that refuses never carried it; and the open card, under no grip at all, lifts for
// anyone. Every drag ends where it began, so a refused claim is a bit-identical canvas.

installStockCarries();

const NORTH_CARD = { x: -1.2, y: -1.3 };
const SOUTH_CARD = { x: -1.2, y: 1.3 };
const OPEN_CARD = { x: 1.6, y: 0 };
const TARGET = { x: 0.4, y: -0.2 };

interface GripArgs {
  id: string;
}

const meta: Meta<GripArgs> = {
  title: "Tests/Grippable",
  parameters: { gkDoc: "tests.grippable" },
  argTypes: { id: { control: "text" } },
  args: { id: "desk" },
};
export default meta;

function tree(id: string) {
  registerLayout("tests.grip.free", freeLayout);
  registerSurface("tests.grip.north", { layers: [{ paint: "accent" }], radius: 0.08 });
  registerSurface("tests.grip.south", { layers: [{ paint: "alert" }], radius: 0.08 });
  registerSurface("tests.grip.open", { layers: [{ paint: "panelBg" }], radius: 0.08 });
  const desk = node(id.trim() || "desk", Container({ layout: "tests.grip.free" }));
  const hand = (hid: string, seat: string, face: string, at: Point) => {
    const h = node(hid, Container({ layout: "tests.grip.free" }), Transformable({ at }), Grippable({ by: [seat] }));
    add(h, node(`${hid}.card`, Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: face }), Draggable()));
    return h;
  };
  add(desk, hand("northHand", "north", "tests.grip.north", NORTH_CARD));
  add(desk, hand("southHand", "south", "tests.grip.south", SOUTH_CARD));
  add(
    desk,
    node(
      "openCard",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: "tests.grip.open" }),
      Transformable({ at: OPEN_CARD }),
      Draggable(),
    ),
  );
  return desk;
}

function spot(live: Scene, u: Point): { fx: number; fy: number; cx: number; cy: number } {
  const v = live.host.viewport();
  const g = apply(viewTransform(live.host.unit(), v.width, v.height), u);
  const r = live.host.view.getBoundingClientRect();
  return { fx: g.x / v.width, fy: g.y / v.height, cx: r.left + g.x, cy: r.top + g.y };
}

function pointer(view: HTMLCanvasElement, type: string, s: { cx: number; cy: number }): void {
  view.dispatchEvent(new PointerEvent(type, { clientX: s.cx, clientY: s.cy, pointerId: 7, bubbles: true }));
}

/** Quiet that STAYS quiet — see Tests/Draggable on why two frames are not enough. */
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

/** Drag from `from` to `to` and back home, waiting for the card to actually travel. */
async function dragOut(glass: HTMLCanvasElement, live: Scene, from: Point, bg: [number, number, number, number]): Promise<void> {
  const a = spot(live, from);
  const b = spot(live, TARGET);
  pointer(live.host.view, "pointerdown", a);
  pointer(live.host.view, "pointermove", b);
  await waitFor(() => (differs(pixelAt(glass, b.fx, b.fy), bg) ? true : null), "the card never followed the finger");
  pointer(live.host.view, "pointermove", a);
  await waitFor(() => (differs(pixelAt(glass, a.fx, a.fy), bg) ? true : null), "the card never trailed back");
  pointer(live.host.view, "pointerup", a);
  await calm(glass);
}

export const Hands: StoryObj<GripArgs> = {
  args: { id: "desk" },
  parameters: { gkDocStory: "tests.grippable.hands", controls: { include: ["id"] } },
  render: ({ id }) => wireDrag(scene(tree(id), { animate: true }), { may: (n) => grippableBy(n, "north") }).el,
  play: checks([
    {
      name: "play.grippable.your-hand-lifts — north's finger moves north's card",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const bg = pixelAt(glass, 0.02, 0.02);
        await calm(glass);
        await dragOut(glass, live, NORTH_CARD, bg);
      },
    },
    {
      name: "play.grippable.anothers-hand-refuses — south's card ignores the same finger, pixel for pixel",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        await calm(glass);
        const before = snapshot(glass);
        const s = spot(live, SOUTH_CARD);
        const t = spot(live, TARGET);
        pointer(live.host.view, "pointerdown", s);
        pointer(live.host.view, "pointermove", t);
        pointer(live.host.view, "pointerup", t);
        await settled();
        // The grip sits on the HAND: the card that refused never carried the atom, and the
        // whole canvas is bit-identical — no grab, no flight, no invite, nothing.
        await expect(imagesDiffer(before, snapshot(glass)), "south's card did not move").toBe(false);
      },
    },
    {
      name: "play.grippable.the-open-desk-lifts — a card under no grip is anyone's to move",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const bg = pixelAt(glass, 0.02, 0.02);
        await calm(glass);
        await dragOut(glass, live, OPEN_CARD, bg);
      },
    },
  ]),
};
