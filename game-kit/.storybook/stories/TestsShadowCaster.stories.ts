import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  Lit,
  node,
  rect,
  registerLayout,
  registerSurface,
  ShadowCaster,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { checks, differs, painted, pixelAt, settled, standing, type CheckContext } from "../devtools/checks.js";

// THE SHADOW ON THE GLASS. The plan states where a shadow falls; this rung proves ink actually
// lies there: darkness beyond the caster's own edge, on the lamp's side and nowhere else. The
// probes sit just OUTSIDE the card's contour, so what they read is never the face — it is desk,
// or desk under shadow. One card in the middle of the desk, the stock lamp top-right unless the
// step brings its own.

const FACE = "tests.shadow.face";

interface ShadowArgs {
  id: string;
}

const meta: Meta<ShadowArgs> = {
  title: "Tests/ShadowCaster",
  parameters: { gkDoc: "tests.shadowCaster" },
  argTypes: { id: { control: "text" } },
  args: { id: "card" },
};
export default meta;

function tree(id: string, lampAngle: number, z: number) {
  registerSurface(FACE, { layers: [{ paint: "accent" }], radius: 0.08 });
  registerLayout("tests.shadow.free", freeLayout);
  const desk = node(
    "desk",
    Container({ layout: "tests.shadow.free" }),
    Lit({ light: { frame: "viewer", angle: lampAngle } }),
  );
  add(
    desk,
    node(
      id.trim() || "card",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: FACE }),
      Transformable({ at: { x: 0, y: 0 }, z }),
      ShadowCaster(),
    ),
  );
  return desk;
}

/** A probe point in units, as canvas fractions for `pixelAt`. */
function probe(live: { host: { viewport(): { width: number; height: number }; unit(): number } }, x: number, y: number): [number, number] {
  const v = live.host.viewport();
  const u = live.host.unit();
  return [(v.width / 2 + x * u) / v.width, (v.height / 2 + y * u) / v.height];
}

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

export const Cast: StoryObj<ShadowArgs> = {
  args: { id: "card" },
  parameters: { gkDocStory: "tests.shadowCaster.cast", controls: { include: ["id"] } },
  render: ({ id }) => scene(tree(id, 315, 1)).el,
  play: checks([
    {
      name: "play.shadow.the-fall-is-inked — darkness beyond the edge, on the lamp's side only",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const bg = pixelAt(glass, 0.02, 0.02);
        // The stock lamp hangs top-right: the fall is down-left. Just outside the card's left
        // edge the desk lies in shadow; just outside its right edge it is bare desk.
        const [lx, ly] = probe(live, -0.535, 0.3);
        const [rx, ry] = probe(live, 0.535, -0.3);
        await expect(differs(pixelAt(glass, lx, ly), bg), "the down-left rim lies in shadow").toBe(true);
        await expect(differs(pixelAt(glass, rx, ry), bg), "the up-right rim is bare desk").toBe(false);
      },
    },
    {
      name: "play.shadow.the-lamp-walks — turn the light and the fall crosses the card",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const bg = pixelAt(glass, 0.02, 0.02);
        // The lamp moves to the bottom-left corner; the same two probes now answer the other
        // way around. One root field turned EVERY fall — no per-piece light exists to disagree.
        live.setRoot(tree(id, 135, 1));
        await settled();
        const [lx, ly] = probe(live, -0.535, 0.3);
        const [rx, ry] = probe(live, 0.535, -0.3);
        await expect(differs(pixelAt(glass, rx, ry), bg), "the up-right rim lies in shadow now").toBe(true);
        await expect(differs(pixelAt(glass, lx, ly), bg), "the down-left rim came clean").toBe(false);
        live.setRoot(tree(id, 315, 1));
        await settled();
      },
    },
    {
      name: "play.shadow.height-stretches-the-fall — z is the source, the shadow's reach its consequence",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const bg = pixelAt(glass, 0.02, 0.02);
        // A probe half a card off the edge: resting (z 0), the hair of shadow does not reach
        // it; lifted to z 4, the stretched fall does. Same lamp, same card — only the height
        // moved, and only the height is allowed to move the reach.
        const [fx, fy] = probe(live, -0.55, 0.35);
        live.setRoot(tree(id, 315, 0));
        await settled();
        await expect(differs(pixelAt(glass, fx, fy), bg), "at rest the far probe is bare").toBe(false);
        live.setRoot(tree(id, 315, 4));
        await settled();
        await expect(differs(pixelAt(glass, fx, fy), bg), "lifted, the fall reaches it").toBe(true);
        live.setRoot(tree(id, 315, 1));
        await settled();
      },
    },
  ]),
};
