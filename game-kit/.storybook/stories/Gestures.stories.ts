import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  CONTROL_LABEL,
  Draggable,
  freeLayout,
  Labeled,
  node,
  rect,
  roundedRect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  type Node,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// GESTURES — one page per gesture, and on every one of them the SAME element answers.
//
// UNDER `Engine/` and not beside the atoms, because a gesture is neither. It puts no field on a
// node and assembles nothing: it is a seam of the INPUT wiring (`render/hold.ts`), and the catalog's
// rule is that a story lives where the law it proves lives. `Engine/Motion` is the same shape from
// the other side — the runtime that ANSWERS, where this is the runtime that ASKS.
//
// The point of the shelf is that a gesture is a seam you can look at alone. A card carries a dozen
// capabilities and a menu on top, and when a hold does not fire on it there are ten places to look.
// Here there is one square, one gesture and one animation, so "it did not move" has exactly one
// meaning.
//
// The square is deliberately plain: a rounded box, no border, one fill. It is a target, not a
// picture — anything more and a reader starts reading the shape instead of watching it move.

const TILE = "gesture.tile";

/** The one target every page on this shelf uses: a rounded square with no contour. */
function tile(id: string, size: number): Node {
  return node(
    id,
    Bounded({ bounds: roundedRect(size, size, 0.18) }),
    Surfaced({ surface: TILE }),
    Transformable({ at: { x: 0, y: 0 } }),
    // A hand may take hold of it — which is what `want` on the hold wiring asks about.
    Draggable(),
  );
}

/** The scene every page builds: the tile, and a line saying what the gesture last did. */
function stage(size: number, said: string): Node {
  registerSurface(TILE, { layers: [{ paint: "accent" }], radius: 0.18 });
  registerLayout("gesture.free", freeLayout);
  const desk = node("desk", Container({ layout: "gesture.free" }));
  add(desk, tile("tile", size));
  add(
    desk,
    node(
      "said",
      Bounded({ bounds: rect(3.6, 0.34) }),
      Transformable({ at: { x: 0, y: 1.5 } }),
      Labeled({ label: said, style: CONTROL_LABEL }),
    ),
  );
  return desk;
}

interface GestureArgs {
  size: number;
}

const meta: Meta = {
  title: "Engine/Gestures",
  parameters: { gkDoc: "gestures.component" },
};
export default meta;

export const Hold: StoryObj<GestureArgs> = {
  // HOLD THE SQUARE. Half a second of a finger that does not travel, and the tile shivers — the
  // answer to a gesture that has just changed meaning. Without it a player who gets no reply lifts
  // their finger to check, cancelling the very gesture they were making.
  render: ({ size }) => {
    let said = "hold the square";
    const live = scene(stage(size, said), {
      // The shiver rides the ONE clock, so this page runs on the motion runtime, not the still painter.
      motion: {},
      hold: {
        want: (n) => n.id === "tile",
        onHold: (on) => {
          live.motions?.shiver(on.id);
          said = "held → shiver";
          live.setRoot(stage(size, said));
        },
      },
    });
    return live.el;
  },
  args: { size: 1.2 },
  argTypes: { size: documented("arg.w", { control: { type: "number", min: 0.2, step: 0.1 } }, "tile/bounds") },
  parameters: { gkDocStory: "gestures.hold" },
};

export const Tap: StoryObj<GestureArgs> = {
  // A TAP IS THE OTHER HALF of the same press, and the pair is what makes either legible: the same
  // finger, on the same square, means one thing when it leaves quickly and another when it stays.
  render: ({ size }) => {
    let said = "tap the square";
    const live = scene(stage(size, said), {
      motion: {},
      tap: (hit) => {
        said = hit ? `tapped ${hit.id}` : "tapped the bare desk";
        live.setRoot(stage(size, said));
      },
    });
    return live.el;
  },
  args: { size: 1.2 },
  argTypes: { size: documented("arg.w", { control: { type: "number", min: 0.2, step: 0.1 } }, "tile/bounds") },
  parameters: { gkDocStory: "gestures.tap" },
};
