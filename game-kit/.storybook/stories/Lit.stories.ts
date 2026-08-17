import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  DEFAULT_LIGHT,
  DEFAULT_SHADOW,
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
    // The atom's two fields — the lamp's direction and its depth — both live on the one scene, and
    // every control below is named after the field's own key.
    gkFields: { light: ["Light"], shadow: ["Light"] },
  },
};
export default meta;

interface LightArgs {
  face: string;
  angle: number;
  frame: Frame;
  base: number;
  perZ: number;
  lifted: number;
  opacity: number;
}

export const Light: StoryObj<LightArgs> = {
  // Two pieces of different height under one lamp. Walk `angle` and every fall turns together —
  // the light is the ROOT's, and a piece cannot bring its own. The taller piece throws the longer
  // shadow: the lamp owns the direction, the height owns the length — and `shadow` owns the SCALE
  // of that length (`base` at rest, `perZ` per unit of height, `lifted` in flight) and the ink.
  render: (a) => {
    registerSurface("story.lit.low", { layers: [{ paint: a.face }], radius: 0.08 });
    registerSurface("story.lit.high", { layers: [{ paint: "alert" }], radius: 0.5 });
    registerLayout("story.lit.free", freeLayout);
    const desk = node(
      "desk",
      Container({ layout: "story.lit.free" }),
      Lit({ light: { frame: a.frame, angle: a.angle }, shadow: { base: a.base, perZ: a.perZ, lifted: a.lifted, opacity: a.opacity } }),
    );
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
  args: { face: "accent", angle: DEFAULT_LIGHT.angle, frame: DEFAULT_LIGHT.frame, ...DEFAULT_SHADOW },
  argTypes: {
    face: documented("arg.face", { control: "select", options: PAINTS }, "surface"),
    angle: documented("arg.light.angle", { control: { type: "range", min: 0, max: 360, step: 5 } }, "light"),
    frame: documented("arg.frame", { control: "select", options: ["viewer", "world"] }, "light"),
    base: documented("arg.shadow.base", { control: { type: "range", min: 0, max: 0.3, step: 0.01 } }, "shadow"),
    perZ: documented("arg.shadow.perZ", { control: { type: "range", min: 0, max: 0.2, step: 0.005 } }, "shadow"),
    lifted: documented("arg.shadow.lifted", { control: { type: "range", min: 0, max: 0.5, step: 0.01 } }, "shadow"),
    opacity: documented("arg.shadow.opacity", { control: { type: "range", min: 0, max: 1, step: 0.02 } }, "shadow"),
  },
  parameters: { gkDocStory: "lit.light" },
};
