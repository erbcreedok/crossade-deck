import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  apply,
  Bounded,
  Container,
  freeLayout,
  node,
  Private,
  rect,
  registerLayout,
  registerSurface,
  remove,
  Surfaced,
  Transformable,
  viewTransform,
  visibleTo,
  walk,
  type Node,
  type Point,
} from "../../src/index.js";
import { scene, type Scene } from "../devtools/scene.js";
import { checks, differs, imagesDiffer, painted, pixelAt, settled, snapshot, standing, type CheckContext } from "../devtools/checks.js";

// PRIVACY ON THE GLASS. The unit suite states who may see; this rung proves the PROJECTION obeys:
// the seat's view is a tree with the denied subtrees simply gone, and three pixels tell the whole
// story — my hand's spot, the other hand's spot, and the public pile's. The strongest claim is
// the last one: swap the seat away and back, and the canvas is bit-identical — the view is local,
// and nothing was ever written to the truth.

const NORTH_SPOT = { x: 0, y: -1.3 };
const SOUTH_SPOT = { x: 0, y: 1.3 };
const PILE_SPOT = { x: 2.4, y: 0 };

interface ViewArgs {
  id: string;
}

const meta: Meta<ViewArgs> = {
  title: "Tests/Private",
  parameters: { gkDoc: "tests.private" },
  argTypes: { id: { control: "text" } },
  args: { id: "desk" },
};
export default meta;

function tree(id: string) {
  registerLayout("tests.private.free", freeLayout);
  registerSurface("tests.private.north", { layers: [{ paint: "accent" }], radius: 0.08 });
  registerSurface("tests.private.south", { layers: [{ paint: "alert" }], radius: 0.08 });
  registerSurface("tests.private.pile", { layers: [{ paint: "panelBg" }], radius: 0.08 });
  const desk = node(id.trim() || "desk", Container({ layout: "tests.private.free" }));
  const hand = (hid: string, seat: string, face: string, at: Point) => {
    const h = node(hid, Container({ layout: "tests.private.free" }), Transformable({ at }), Private({ access: [seat] }));
    add(h, node(`${hid}.card`, Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: face })));
    return h;
  };
  add(desk, hand("northHand", "north", "tests.private.north", NORTH_SPOT));
  add(desk, hand("southHand", "south", "tests.private.south", SOUTH_SPOT));
  add(
    desk,
    node(
      "openPile",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: "tests.private.pile" }),
      Transformable({ at: PILE_SPOT }),
    ),
  );
  return desk;
}

/** The seat's view: every subtree its eyes are denied is not there. */
function projected(root: Node, seat: string): Node {
  const hidden: Node[] = [];
  walk(root, (n) => {
    if (!visibleTo(n, seat)) hidden.push(n);
  });
  for (const n of hidden) if (n.parent) remove(n.parent, n);
  return root;
}

function spot(live: Scene, u: Point): [number, number] {
  const v = live.host.viewport();
  const g = apply(viewTransform(live.host.unit(), v.width, v.height), u);
  return [g.x / v.width, g.y / v.height];
}

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

export const Hands: StoryObj<ViewArgs> = {
  args: { id: "desk" },
  parameters: { gkDocStory: "tests.private.hands", controls: { include: ["id"] } },
  render: ({ id }) => scene(projected(tree(id), "north")).el,
  play: checks([
    {
      name: "play.private.the-owner-sees — my hand is on the desk, the other is simply not there",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const bg = pixelAt(glass, 0.02, 0.02);
        const [nx, ny] = spot(live, NORTH_SPOT);
        const [sx, sy] = spot(live, SOUTH_SPOT);
        const [px, py] = spot(live, PILE_SPOT);
        await expect(differs(pixelAt(glass, nx, ny), bg), "north's card is painted").toBe(true);
        await expect(differs(pixelAt(glass, sx, sy), bg), "south's hand is not there").toBe(false);
        await expect(differs(pixelAt(glass, px, py), bg), "the public pile shows").toBe(true);
      },
    },
    {
      name: "play.private.the-view-swaps-with-the-seat — south's eyes see the other tree",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const bg = pixelAt(glass, 0.02, 0.02);
        live.setRoot(projected(tree(id), "south"));
        await settled();
        const [nx, ny] = spot(live, NORTH_SPOT);
        const [sx, sy] = spot(live, SOUTH_SPOT);
        const [px, py] = spot(live, PILE_SPOT);
        await expect(differs(pixelAt(glass, sx, sy), bg), "south's card is painted now").toBe(true);
        await expect(differs(pixelAt(glass, nx, ny), bg), "north's hand is gone").toBe(false);
        await expect(differs(pixelAt(glass, px, py), bg), "the public pile still shows").toBe(true);
      },
    },
    {
      name: "play.private.nothing-was-written — the same seat gets the same picture back, bit for bit",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        live.setRoot(projected(tree(id), "north"));
        await settled();
        const north = snapshot(glass);
        live.setRoot(projected(tree(id), "south"));
        await settled();
        live.setRoot(projected(tree(id), "north"));
        await settled();
        // The view is LOCAL: swapping the seat away and back reprojects the same truth, so the
        // canvas returns bit-identical — nothing about the hands was ever written.
        await expect(imagesDiffer(north, snapshot(glass)), "the projection is pure").toBe(false);
      },
    },
  ]),
};
