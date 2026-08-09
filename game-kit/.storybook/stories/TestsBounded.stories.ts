import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import { add, Bounded, circle, node, rect, star, type Shape } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import {
  checks,
  differs,
  imagesDiffer,
  inkOf,
  painted,
  pixelAt,
  settled,
  snapshot,
  standing,
  type CheckContext,
} from "../devtools/checks.js";

// THE SECOND RUNG: the box. `Bounded` is the one atom whose whole lesson is INVISIBLE — it
// declares room and paints nothing — so every claim here is made through the debug outline,
// exactly the way a reader of the `Atoms/Bounded` shelf sees it. What this rung adds over the
// unit suite is the same thing the Node rung added: the outline the plan promises is compared
// with what is actually on the glass, size by size and shape by shape.
//
// The measurements are WHOLE-GLASS, not point probes. An outline is a stroke a couple of device
// pixels wide; a check that samples points either misses it or holds a map of where the stroke
// runs — which is the renderer's business, not the check's. `inkOf` reads the full buffer and
// answers with a count and a box, and a size claim is a claim about that box.

interface OutlineArgs {
  id: string;
}

const meta: Meta<OutlineArgs> = {
  title: "Tests/Bounded",
  parameters: { gkDoc: "tests.bounded" },
  argTypes: { id: { control: "text" } },
  args: { id: "root" },
};
export default meta;

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

/** A tree holding one bounded node of the given shape — or a bare root, with no box at all. */
function tree(id: string, bounds: Shape | null) {
  const root = node(id.trim() || "root");
  if (bounds) add(root, node("box", Bounded({ bounds })));
  return root;
}

// The chevron from `Atoms/Bounded · Path` — the one shape on that shelf no helper builds.
const chevron: Shape = {
  start: { x: -1, y: -0.6 },
  segments: [{ to: { x: 0, y: 0.6 } }, { to: { x: 1, y: -0.6 } }, { to: { x: 0, y: -0.1 } }],
};

/** The glass as ink over the corner reading — the background is measured, never assumed. */
function ink(glass: HTMLCanvasElement) {
  return inkOf(snapshot(glass), pixelAt(glass, 0.02, 0.02));
}

export const Outline: StoryObj<OutlineArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.bounded.outline", controls: { include: ["id"] } },
  // The debug outline starts ON, the same way the `Atoms/Bounded` shelf opens: without it the
  // whole rung would be measuring an empty stage.
  render: ({ id }) => scene(tree(id, rect(1, 1)), { bounds: true }).el,
  play: checks([
    {
      name: "play.bounded.the-outline-is-the-only-ink — a box draws nothing; the debug layer does",
      async run(ctx) {
        const glass = await view(ctx);
        const drawn = ink(glass);
        // There is ink — the outline reached the glass — and the INSIDE of the box is not:
        // `Bounded` paints no fill, and a filled square here would mean the debug layer lies
        // about what the atom does. The probe sits inside the box but OFF the exact centre,
        // because the layer marks the origin with a cross and its arms run along the centre
        // lines — dead centre is legitimately inked.
        await expect(drawn.count).toBeGreaterThan(0);
        await expect(differs(pixelAt(glass, 0.53, 0.53), pixelAt(glass, 0.02, 0.02))).toBe(false);
      },
    },
    {
      name: "play.bounded.size-is-on-the-glass — a wider rect is a wider outline",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const square = ink(glass);
        live.setRoot(tree(id, rect(2, 1)));
        await settled();
        const wide = ink(glass);
        // Twice the declared width is close to twice the drawn width — "close", because the
        // stroke has its own thickness on both ends. The height must NOT follow: a box that
        // grows both ways on a one-axis change is a scale, not a size.
        const widthOf = (b: typeof square) => b.maxX - b.minX;
        const heightOf = (b: typeof square) => b.maxY - b.minY;
        await expect(widthOf(wide)).toBeGreaterThan(widthOf(square) * 1.6);
        await expect(Math.abs(heightOf(wide) - heightOf(square))).toBeLessThan(heightOf(square) * 0.2);
        live.setRoot(tree(id, rect(1, 1)));
        await settled();
      },
    },
    {
      name: "play.bounded.every-shape-draws-its-own-pattern — square, circle, star, path",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        // Each shape against the one before it, on the same canvas. A debug layer that ignored
        // the contour and boxed everything would pass a size check and fail exactly here: a
        // circle and its bounding square differ only in the pattern of the stroke.
        const shelf: readonly Shape[] = [rect(1, 1), circle(0.7), star(5, 1, 0.42), chevron];
        let before = snapshot(glass);
        for (const shape of shelf.slice(1)) {
          live.setRoot(tree(id, shape));
          await settled();
          const after = snapshot(glass);
          await expect(imagesDiffer(before, after)).toBe(true);
          before = after;
        }
        live.setRoot(tree(id, rect(1, 1)));
        await settled();
      },
    },
    {
      name: "play.bounded.no-box-no-ink — a node without Bounded leaves the glass bare",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        live.setRoot(tree(ctx.args["id"] as string, null));
        await settled();
        // Zero, not "less": with no box there is nothing to outline, and any surviving pixel is
        // a mark the layer forgot to take back.
        await expect(ink(glass).count).toBe(0);
        live.setRoot(tree(ctx.args["id"] as string, rect(1, 1)));
        await settled();
      },
    },
  ]),
};
