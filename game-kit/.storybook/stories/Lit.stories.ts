import type { Meta, StoryObj } from "@storybook/html";
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
  type Frame,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// LIT is the canvas's ONE light — a root-only field, because there is no per-piece lamp. What it
// answers is the direction every shadow falls: `angle` says where the light stands, and `frame`
// says whose corner it hangs in — `viewer` keeps the fall constant on the SCREEN (height reads
// the same from every seat), `world` nails the lamp over the desk so the fall turns with the
// camera. The two differ only while a camera is turned; until the camera arrives, the frame is
// declared here and read by the same one formula that will feel it then.

const meta: Meta = {
  title: "Atoms/Lit",
  parameters: {
    gkDoc: "lit.component",
    gkAtom: "Lit",
    // The atom's one field: both knobs of the lamp live on the one scene.
    gkFields: { light: ["Light"] },
  },
};
export default meta;

interface LightArgs {
  face: string;
  lampAngle: number;
  frame: Frame;
}

export const Light: StoryObj<LightArgs> = {
  // Two pieces of different height under one lamp. Walk `lampAngle` and every fall turns
  // together — the light is the ROOT's, and a piece cannot bring its own. The taller piece
  // throws the longer shadow: the lamp owns the direction, the height owns the length.
  render: (a) => {
    registerSurface("story.lit.low", { layers: [{ paint: a.face }], radius: 0.08 });
    registerSurface("story.lit.high", { layers: [{ paint: "alert" }], radius: 0.5 });
    registerLayout("story.lit.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.lit.free" }), Lit({ light: { frame: a.frame, angle: a.lampAngle } }));
    add(
      desk,
      node(
        "lowCard",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.lit.low" }),
        Transformable({ at: { x: -1, y: 0 }, z: 0 }),
        ShadowCaster(),
      ),
    );
    add(
      desk,
      node(
        "highToken",
        Bounded({ bounds: rect(0.9, 0.9) }),
        Surfaced({ surface: "story.lit.high" }),
        Transformable({ at: { x: 1.1, y: 0.1 }, z: 3 }),
        ShadowCaster(),
      ),
    );
    return scene(desk).el;
  },
  args: { face: "accent", lampAngle: 315, frame: "viewer" },
  argTypes: {
    face: documented("arg.face", { control: "select", options: PAINTS }, "surface"),
    lampAngle: documented("arg.lampAngle", { control: { type: "range", min: 0, max: 360, step: 5 } }, "light"),
    frame: documented("arg.frame", { control: "select", options: ["viewer", "world"] }, "light"),
  },
  parameters: { gkDocStory: "lit.light" },
};
