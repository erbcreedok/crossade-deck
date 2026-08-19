import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  apply,
  Bounded,
  Container,
  Draggable,
  freeLayout,
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
import {
  checks,
  differs,
  imagesDiffer,
  painted,
  pixelAt,
  snapshot,
  standing,
  waitFor,
  type CheckContext,
} from "../devtools/checks.js";

// DRAGGABLE ON THE GLASS. The atom is a marker plus one word (`onReject`); the proof it is WIRED is
// a pointer actually moving ink. So every claim here is played with synthetic pointer events against
// the canvas the reader drags — the same wiring, the same pick, the same clock — and read back as
// pixels: the card's paint leaves its seat, arrives under the finger, and a refused drop either
// flies it home (the picture is bit-identical to the start) or strands it where the finger let go.
// The stone is the control group: no atom, no lift, and the picture does not move at all.
//
// The carry runs with no pop and no lean, deliberately: the feel knobs are the shelf's lesson; this
// rung measures POSITIONS, and a pure translation returns to a bit-identical picture.

installStockCarries();

const FACE = "tests.drag.face";
const STONE = "tests.drag.stone";
const CARD_AT = { x: -1.2, y: 0 };
const STONE_AT = { x: 1.2, y: 0.9 };
const TARGET = { x: 0.8, y: -0.9 };

interface DragArgs {
  id: string;
}

const meta: Meta<DragArgs> = {
  title: "Tests/Draggable",
  parameters: { gkDoc: "tests.draggable" },
  argTypes: { id: { control: "text" } },
  args: { id: "card" },
};
export default meta;

function tree(id: string, onReject: "home" | "stay") {
  registerSurface(FACE, { layers: [{ paint: "accent" }] });
  registerSurface(STONE, { layers: [{ paint: "textMuted" }] });
  registerLayout("tests.drag.free", freeLayout);
  const desk = node("desk", Container({ layout: "tests.drag.free" }));
  add(
    desk,
    node(
      id.trim() || "card",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: FACE }),
      Transformable({ at: CARD_AT }),
      Draggable({ onReject }),
    ),
  );
  add(
    desk,
    node("stone", Bounded({ bounds: rect(0.9, 0.9) }), Surfaced({ surface: STONE }), Transformable({ at: STONE_AT })),
  );
  return desk;
}

/** A unit point as canvas fractions (for `pixelAt`) and client coordinates (for a pointer). */
function spot(live: Scene, u: Point): { fx: number; fy: number; cx: number; cy: number } {
  const v = live.host.viewport();
  const g = apply(viewTransform(live.host.unit(), v.width, v.height), u);
  const r = live.host.view.getBoundingClientRect();
  return { fx: g.x / v.width, fy: g.y / v.height, cx: r.left + g.x, cy: r.top + g.y };
}

function pointer(view: HTMLCanvasElement, type: string, s: { cx: number; cy: number }): void {
  view.dispatchEvent(new PointerEvent(type, { clientX: s.cx, clientY: s.cy, pointerId: 7, bubbles: true }));
}

/**
 * Wait for the glass to go QUIET — and STAY quiet. `settled()` is two frames flat, which is
 * right for a still scene and nowhere near a 180ms settle: an animate scene sampled that early
 * hands back a card photographed in mid-air. One identical pair is not enough either — a flight
 * scheduled on this very tick has not drawn its first moving frame yet, and that gap reads as
 * "quiet". Four identical frames in a row (~64ms) outlast the gap: a real flight moves the
 * card's edge every frame, and the idle-gate stops repainting only when every flight has landed.
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

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

export const Drag: StoryObj<DragArgs> = {
  args: { id: "card" },
  parameters: { gkDocStory: "tests.draggable.drag", controls: { include: ["id"] } },
  render: ({ id }) => wireDrag(scene(tree(id, "home"), { animate: true })).el,
  play: checks([
    {
      name: "play.draggable.a-card-follows-the-finger — the paint leaves its seat and arrives under the pointer",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const bg = pixelAt(glass, 0.02, 0.02);
        const home = spot(live, CARD_AT);
        const target = spot(live, TARGET);
        await expect(differs(pixelAt(glass, home.fx, home.fy), bg), "the card rests at its seat").toBe(true);
        pointer(live.host.view, "pointerdown", home);
        pointer(live.host.view, "pointermove", target);
        // The run rides the finger 1:1, but the claim is patient anyway: a paint arrives on the
        // glass a frame after the plan asks for it, and this reads pixels, not the plan.
        await waitFor(
          () => (differs(pixelAt(glass, target.fx, target.fy), bg) ? true : null),
          "the card never arrived under the finger",
        );
        await waitFor(
          () => (differs(pixelAt(glass, home.fx, home.fy), bg) ? null : true),
          "the card's paint never left its seat",
        );
        // End the gesture where it began: the drop is refused, and home is a no-op flight.
        pointer(live.host.view, "pointermove", home);
        await waitFor(
          () => (differs(pixelAt(glass, home.fx, home.fy), bg) ? true : null),
          "the card never trailed back to its seat",
        );
        pointer(live.host.view, "pointerup", home);
        await calm(glass);
      },
    },
    {
      name: "play.draggable.a-refused-drop-flies-home — release far away, the picture returns bit-identical",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const bg = pixelAt(glass, 0.02, 0.02);
        const home = spot(live, CARD_AT);
        const target = spot(live, TARGET);
        await calm(glass); // the reference picture must be REST, not a neighbour step's last frame
        const before = snapshot(glass);
        pointer(live.host.view, "pointerdown", home);
        pointer(live.host.view, "pointermove", target);
        await waitFor(
          () => (differs(pixelAt(glass, target.fx, target.fy), bg) ? true : null),
          "the card never arrived under the finger",
        );
        pointer(live.host.view, "pointerup", target);
        // Nothing here accepts a drop, and `onReject: "home"` means the tree was never written:
        // the next reconcile flies the card back to the ONLY rest it ever had.
        await waitFor(
          () => (differs(pixelAt(glass, home.fx, home.fy), bg) ? true : null),
          "the refused card never flew home",
        );
        await waitFor(
          () => (differs(pixelAt(glass, target.fx, target.fy), bg) ? null : true),
          "the refused card left paint at the release point",
        );
        await calm(glass);
        await expect(imagesDiffer(before, snapshot(glass)), "home restores the exact picture").toBe(false);
      },
    },
    {
      name: "play.draggable.stay-strands-the-card — the release seat becomes the new rest",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const id = ctx.args["id"] as string;
        const bg = pixelAt(glass, 0.02, 0.02);
        live.setRoot(tree(id, "stay"));
        await calm(glass);
        const home = spot(live, CARD_AT);
        const target = spot(live, TARGET);
        pointer(live.host.view, "pointerdown", home);
        pointer(live.host.view, "pointermove", target);
        await waitFor(
          () => (differs(pixelAt(glass, target.fx, target.fy), bg) ? true : null),
          "the card never arrived under the finger",
        );
        pointer(live.host.view, "pointerup", target);
        await calm(glass);
        // `stay` WROTE the release seat into the tree: the card rests where the finger left it,
        // and its old seat is bare desk.
        await expect(differs(pixelAt(glass, target.fx, target.fy), bg), "the card rests at the release seat").toBe(
          true,
        );
        await expect(differs(pixelAt(glass, home.fx, home.fy), bg), "the old seat is bare").toBe(false);
        live.setRoot(tree(id, "home"));
        await waitFor(
          () => (differs(pixelAt(glass, home.fx, home.fy), bg) ? true : null),
          "the reset tree never eased the card back",
        );
        await calm(glass);
      },
    },
    {
      name: "play.draggable.only-a-draggable-lifts — the stone refuses the finger, pixel for pixel",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const stone = spot(live, STONE_AT);
        const target = spot(live, TARGET);
        await calm(glass);
        const before = snapshot(glass);
        pointer(live.host.view, "pointerdown", stone);
        pointer(live.host.view, "pointermove", target);
        pointer(live.host.view, "pointerup", target);
        await calm(glass);
        // The pick asked `draggable` and the stone never had the atom: no grab, no flight, no
        // change — the whole canvas is bit-identical.
        await expect(imagesDiffer(before, snapshot(glass)), "the stone did not move").toBe(false);
      },
    },
  ]),
};
