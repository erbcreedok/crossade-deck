import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  Acceptor,
  add,
  Bounded,
  Container,
  Draggable,
  freeLayout,
  installStockCarries,
  installStockCoats,
  Inviting,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  Valued,
  viewTransform,
  apply,
  type Point,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene, type Scene } from "../devtools/scene.js";
import { checks, differs, painted, pixelAt, settled, standing, waitFor, type CheckContext } from "../devtools/checks.js";

// THE INVITE ON THE GLASS. The unit suite states who is willing and what goes on; this rung
// proves the paint actually answers the finger: pick up the seven and the zone's face changes,
// let go and it comes back, pick up the eight and nothing ever lights. The invite here is a
// `wash`, so the claim is one pixel in the zone's middle — before, lit, and after.

const ZONE_AT = { x: 1.2, y: 0 };
const SEVEN_AT = { x: -1.4, y: -0.8 };
const EIGHT_AT = { x: -1.4, y: 0.9 };

installStockCoats();
installStockCarries();

interface InviteArgs {
  id: string;
}

const meta: Meta<InviteArgs> = {
  title: "Tests/Inviting",
  parameters: { gkDoc: "tests.inviting" },
  argTypes: { id: { control: "text" } },
  args: { id: "sevenZone" },
};
export default meta;

function tree(id: string) {
  registerSurface("tests.invite.zone", { layers: [{ paint: "sunkBg" }], radius: 0.12 });
  registerSurface("tests.invite.card", { layers: [{ paint: "accent" }], radius: 0.08 });
  registerLayout("tests.invite.free", freeLayout);
  const desk = node("desk", Container({ layout: "tests.invite.free" }));
  add(
    desk,
    node(
      id.trim() || "sevenZone",
      Bounded({ bounds: rect(1.5, 1.9) }),
      Container({ layout: "tests.invite.free" }),
      Surfaced({ surface: "tests.invite.zone" }),
      Transformable({ at: ZONE_AT }),
      Acceptor({ accept: { eq: ["el.values.rank", 7] } }),
      Inviting({ coat: { recipe: "wash", level: 0.5, tint: "accent" } }),
    ),
  );
  const card = (cid: string, at: Point, rank: number) =>
    node(
      cid,
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: "tests.invite.card" }),
      Transformable({ at }),
      Valued({ values: { rank } }),
      Draggable(),
    );
  add(desk, card("seven", SEVEN_AT, 7));
  add(desk, card("eight", EIGHT_AT, 8));
  return desk;
}

/** A unit point as canvas fractions and client coordinates. */
function spot(live: Scene, u: Point): { fx: number; fy: number; cx: number; cy: number } {
  const v = live.host.viewport();
  const g = apply(viewTransform(live.host.unit(), v.width, v.height), u);
  const r = live.host.view.getBoundingClientRect();
  return { fx: g.x / v.width, fy: g.y / v.height, cx: r.left + g.x, cy: r.top + g.y };
}

function pointer(view: HTMLCanvasElement, type: string, s: { cx: number; cy: number }): void {
  view.dispatchEvent(new PointerEvent(type, { clientX: s.cx, clientY: s.cy, pointerId: 7, bubbles: true }));
}

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

export const Invite: StoryObj<InviteArgs> = {
  args: { id: "sevenZone" },
  parameters: { gkDocStory: "tests.inviting.invite", controls: { include: ["id"] } },
  render: ({ id }) => wireDrag(scene(tree(id), { animate: true })).el,
  play: checks([
    {
      name: "play.inviting.a-willing-zone-lights — pick up the seven and the wash goes on",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const zone = spot(live, ZONE_AT);
        const seven = spot(live, SEVEN_AT);
        const before = pixelAt(glass, zone.fx, zone.fy);
        pointer(live.host.view, "pointerdown", seven);
        await waitFor(
          () => (differs(pixelAt(glass, zone.fx, zone.fy), before) ? true : null),
          "the willing zone never lit",
        );
        pointer(live.host.view, "pointerup", seven);
        await waitFor(
          () => (differs(pixelAt(glass, zone.fx, zone.fy), before) ? null : true),
          "the zone never came back after the release",
        );
      },
    },
    {
      name: "play.inviting.release-undresses — the coat comes off with the finger, exactly",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const zone = spot(live, ZONE_AT);
        const seven = spot(live, SEVEN_AT);
        const before = pixelAt(glass, zone.fx, zone.fy);
        pointer(live.host.view, "pointerdown", seven);
        await waitFor(
          () => (differs(pixelAt(glass, zone.fx, zone.fy), before) ? true : null),
          "the willing zone never lit",
        );
        pointer(live.host.view, "pointerup", seven);
        // The undo puts back what stood there — the zone's middle reads the very value it did
        // before the grab, not merely "something different from lit".
        await waitFor(
          () => (differs(pixelAt(glass, zone.fx, zone.fy), before) ? null : true),
          "the invite never came off",
        );
        await settled();
        await expect(differs(pixelAt(glass, zone.fx, zone.fy), before), "the zone middle is restored").toBe(false);
      },
    },
    {
      name: "play.inviting.a-refused-card-leaves-it-dark — the eight moves nothing",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const zone = spot(live, ZONE_AT);
        const eight = spot(live, EIGHT_AT);
        const before = pixelAt(glass, zone.fx, zone.fy);
        pointer(live.host.view, "pointerdown", eight);
        await settled();
        await expect(
          differs(pixelAt(glass, zone.fx, zone.fy), before),
          "an unwilling zone shows nothing while the eight is held",
        ).toBe(false);
        pointer(live.host.view, "pointerup", eight);
        await settled();
      },
    },
  ]),
};
