import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import { Bounded, node, rect, registerSurface, Surfaced, Tiltable, tiltAngle, Transformable } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import {
  checks,
  gap,
  imagesDiffer,
  inkOf,
  painted,
  pixelAt,
  settled,
  snapshot,
  standing,
  type CheckContext,
} from "../devtools/checks.js";

// TILTABLE ON THE GLASS. The atom answers an angle and nothing more; the proof it is WIRED is that
// the answer moves the card. So every claim here is read off the ink: a 1×1.4 card upright is taller
// than wide, and tapped to 90° it is wider than tall — the bounding box's two sides swap, which is a
// turn no other change makes. What the unit suite states about `tiltAngle` / `nextTilt` in the
// abstract, this rung makes the renderer show.
//
// Measurements are WHOLE-GLASS. A rotated card is a filled quad, and the honest question about it is
// the size of the box its ink fills — `inkOf` reads the full buffer and answers with that box.

const FACE = "tests.tilt.face";

interface TiltArgs {
  id: string;
}

const meta: Meta<TiltArgs> = {
  title: "Tests/Tiltable",
  parameters: { gkDoc: "tests.tiltable" },
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
 * A card resting on one stop. The spec node carries `Tiltable`; the displayed node carries only the
 * pose the resolver chose — `tiltAngle` written into `angle`, exactly the wiring the shelf shows.
 */
function tree(id: string, stops: readonly number[], index: number) {
  registerSurface(FACE, { layers: [{ paint: "accent" }] });
  const spec = node(
    "spec",
    Bounded({ bounds: rect(1, 1.4) }),
    Surfaced({ surface: FACE }),
    Transformable({}),
    Tiltable({ stops: [...stops], wrap: true }),
  );
  return node(
    id.trim() || "card",
    Bounded({ bounds: rect(1, 1.4) }),
    Surfaced({ surface: FACE }),
    Transformable({ angle: tiltAngle(spec, index) ?? 0 }),
  );
}

export const Tap: StoryObj<TiltArgs> = {
  args: { id: "card" },
  parameters: { gkDocStory: "tests.tiltable.tap", controls: { include: ["id"] } },
  render: ({ id }) => scene(tree(id, [0, 90], 0)).el,
  play: checks([
    {
      name: "play.tiltable.a-stop-turns-the-card — upright is portrait, tapped is landscape",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // Upright: the 1.4-unit side is the height, the 1-unit side the width — taller than wide.
        const upright = ink(glass);
        await expect(
          heightOf(upright),
          `upright ${Math.round(heightOf(upright))}px tall · ${Math.round(widthOf(upright))}px wide`,
        ).toBeGreaterThan(widthOf(upright) * 1.2);
        // Tap to the second stop, 90°. The box turns a quarter, so the two sides SWAP: now wider
        // than tall, and by the same ratio.
        live.setRoot(tree(id, [0, 90], 1));
        await settled();
        const tapped = ink(glass);
        await expect(
          widthOf(tapped),
          `tapped ${Math.round(widthOf(tapped))}px wide · ${Math.round(heightOf(tapped))}px tall`,
        ).toBeGreaterThan(heightOf(tapped) * 1.2);
        // And the swap is EXACT: upright's height is tapped's width, upright's width is tapped's
        // height — a genuine quarter turn about the centre, no float smear at the right angle.
        await expect(...gap("height→width", widthOf(tapped), heightOf(upright))).toBeLessThan(
          Math.round(heightOf(upright) * 0.08),
        );
        await expect(...gap("width→height", heightOf(tapped), widthOf(upright))).toBeLessThan(
          Math.round(widthOf(upright) * 0.08),
        );
        live.setRoot(tree(id, [0, 90], 0));
        await settled();
      },
    },
    {
      name: "play.tiltable.every-stop-is-its-own-picture — 0 · 120 · 240 each differ",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // Three stops a third of a circle apart. A resolver that ignored the index would paint the
        // same picture three times and fail here; each must differ from the one before it.
        live.setRoot(tree(id, [0, 120, 240], 0));
        await settled();
        let before = snapshot(glass);
        for (const index of [1, 2]) {
          live.setRoot(tree(id, [0, 120, 240], index));
          await settled();
          const after = snapshot(glass);
          await expect(imagesDiffer(before, after), `stop ${index} differs from stop ${index - 1}`).toBe(true);
          before = after;
        }
        live.setRoot(tree(id, [0, 90], 0));
        await settled();
      },
    },
    {
      name: "play.tiltable.the-tap-clamps — an index past the end holds on the last stop",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // The last stop, and then an index far past it. A clamp means the same picture, not a blank
        // card and not a wrap — `wrap` moves the tap ONE past the end, it does not rescue an index
        // that is already out of range.
        live.setRoot(tree(id, [0, 90], 1));
        await settled();
        const last = snapshot(glass);
        live.setRoot(tree(id, [0, 90], 5));
        await settled();
        const past = snapshot(glass);
        await expect(imagesDiffer(last, past), "index 5 paints the same as the last stop").toBe(false);
        await expect(ink(glass).count, "the clamped card still has ink").toBeGreaterThan(0);
        live.setRoot(tree(id, [0, 90], 0));
        await settled();
      },
    },
  ]),
};
