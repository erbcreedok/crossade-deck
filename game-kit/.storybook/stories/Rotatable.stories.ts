import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Draggable,
  freeLayout,
  installStockCarries,
  node,
  rect,
  registerLayout,
  registerSurface,
  Rotatable,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// ROTATABLE says one thing as data: this element may be TURNED by hand, and where its angle lands
// when the fingers let go. Everything else is runtime — the two-finger work is the game's own, and
// the catalog's copy of it lives in `devtools/drag.ts`, beside the drag it grew out of.
//
// TWO FINGERS: hold the piece with one and swing the other around it. On a machine with one pointer
// there is nothing to swing, which is the honest cost of a gesture that IS two fingers — the panel
// still shows what each policy does, because `onRelease` decides where the piece lands and the
// settle plays either way.
//
// It is not `Tiltable`. That is a TAP walking a few declared stops, with no angle in between; this
// is a continuous angle a hand chose. A node may carry both, and they never argue — both write the
// same `Transformable.angle`.
//
// The carry styles are installed here, as an ordinary consumer would install them.
installStockCarries();

const meta: Meta = {
  title: "Atoms/Rotatable",
  parameters: {
    gkDoc: "rotatable.component",
    gkAtom: "Rotatable",
    gkFields: { onRelease: ["Turn"], snap: ["Turn"] },
  },
};
export default meta;

interface TurnArgs {
  id: string;
  w: number;
  h: number;
  face: string;
  radius: number;
  angle: number;
  onRelease: "keep" | "home" | "snap";
  snap: number;
}

export const Turn: StoryObj<TurnArgs> = {
  // ONE PIECE THAT TURNS. Put a finger on it, put a second finger down, and swing: the angle
  // follows the line between the two, live. Let go and the atom answers — `keep` leaves it where
  // the hand did, `home` flies it back to the angle it started at, `snap` drops it on the nearest
  // step. The outline behind it is the same box at zero degrees, so how far it has been turned is
  // readable at a glance rather than from memory.
  render: ({ id, w, h, face, radius, angle, onRelease, snap }) => {
    registerLayout("story.turn.free", freeLayout);
    registerSurface("story.turn.face", { layers: [{ paint: face }], radius });
    // An OUTLINE, not a plate: filled, it reads as a second piece lying under the first, and on a
    // dark desk it is nearly invisible anyway. What is wanted is the box the piece left behind.
    registerSurface("story.turn.ghost", { layers: [], radius, stroke: { color: "textFaint", width: 0.02, opacity: 0.7 } });
    const desk = node("desk", Container({ layout: "story.turn.free" }));
    // The mark of where it stood: same box, no angle, underneath. A turn read against nothing is a
    // turn nobody can judge.
    add(desk, node("mark", Bounded({ bounds: rect(w, h) }), Surfaced({ surface: "story.turn.ghost" })));
    add(
      desk,
      node(
        id.trim() || "piece",
        Bounded({ bounds: rect(w, h) }),
        Surfaced({ surface: "story.turn.face" }),
        Transformable({ at: { x: 0, y: 0 }, angle, z: 1 }),
        Rotatable({ onRelease, snap }),
        // Draggable too, and that is the ordinary pairing: one finger moves the piece, two turn it.
        // The turn takes over when the second finger lands, because a carried node's pose belongs
        // to the carry until it is let go.
        Draggable({ onReject: "stay" }),
      ),
    );
    return wireDrag(scene(desk, { animate: true })).el;
  },
  args: {
    id: "piece",
    w: 1.1,
    h: 1.5,
    face: "accent",
    radius: 0.08,
    angle: 0,
    onRelease: "keep",
    snap: 45,
  },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "piece"),
    w: documented("arg.w", { control: { type: "number", min: 0, step: 0.1 } }, "piece/bounds"),
    h: documented("arg.h", { control: { type: "number", min: 0, step: 0.1 } }, "piece/bounds"),
    face: documented("arg.face", { control: "select", options: PAINTS }, "piece/surface"),
    radius: documented("arg.radius", { control: { type: "number", min: 0, step: 0.02 } }, "piece/surface"),
    angle: documented("arg.angle", { control: { type: "number", step: 15 } }, "piece/transformable"),
    onRelease: documented("arg.onRelease", { control: "inline-radio", options: ["keep", "home", "snap"] }, "rotatable"),
    snap: documented(
      "arg.snapStep",
      { control: { type: "number", min: 0, step: 15 }, if: { arg: "onRelease", eq: "snap" } },
      "rotatable",
    ),
  },
  parameters: { gkDocStory: "rotatable.turn" },
};
