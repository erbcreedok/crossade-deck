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

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };
const HEIGHT = { control: { type: "range", min: 0, max: 5, step: 0.5 } };
const CONTOUR = { control: "select", options: ["footprint", "silhouette"] };

interface LightArgs {
  angle: number;
  frame: Frame;
  base: number;
  perZ: number;
  lifted: number;
  opacity: number;
  deskLayout: string;
  lowW: number;
  lowH: number;
  lowSurface: string;
  lowPaint: string;
  lowRadius: number;
  lowX: number;
  lowY: number;
  lowZ: number;
  lowFrom: "footprint" | "silhouette";
  highW: number;
  highH: number;
  highSurface: string;
  highPaint: string;
  highRadius: number;
  highX: number;
  highY: number;
  highZ: number;
  highFrom: "footprint" | "silhouette";
}

export const Light: StoryObj<LightArgs> = {
  // Two pieces of different height under one lamp. Walk `angle` and every fall turns together —
  // the light is the ROOT's, and a piece cannot bring its own. The taller piece throws the longer
  // shadow: the lamp owns the direction, the height owns the length — and `shadow` owns the SCALE
  // of that length (`base` at rest, `perZ` per unit of height, `lifted` in flight) and the ink.
  render: ({
    angle,
    frame,
    base,
    perZ,
    lifted,
    opacity,
    deskLayout,
    lowW,
    lowH,
    lowSurface,
    lowPaint,
    lowRadius,
    lowX,
    lowY,
    lowZ,
    lowFrom,
    highW,
    highH,
    highSurface,
    highPaint,
    highRadius,
    highX,
    highY,
    highZ,
    highFrom,
  }) => {
    registerSurface(lowSurface, { layers: [{ paint: lowPaint }], radius: lowRadius });
    registerSurface(highSurface, { layers: [{ paint: highPaint }], radius: highRadius });
    registerLayout(deskLayout, freeLayout);
    const desk = node(
      "desk",
      Container({ layout: deskLayout }),
      Lit({ light: { frame, angle }, shadow: { base, perZ, lifted, opacity } }),
    );
    add(
      desk,
      node(
        "lowCard",
        Bounded({ bounds: rect(lowW, lowH) }),
        Surfaced({ surface: lowSurface }),
        Transformable({ at: { x: lowX, y: lowY }, z: lowZ }),
        ShadowCaster({ from: lowFrom }),
      ),
    );
    add(
      desk,
      node(
        "highToken",
        Bounded({ bounds: rect(highW, highH) }),
        Surfaced({ surface: highSurface }),
        Transformable({ at: { x: highX, y: highY }, z: highZ }),
        ShadowCaster({ from: highFrom }),
      ),
    );
    return scene(desk).el;
  },
  args: {
    angle: DEFAULT_LIGHT.angle,
    frame: DEFAULT_LIGHT.frame,
    ...DEFAULT_SHADOW,
    deskLayout: "story.lit.free",
    lowW: 1,
    lowH: 1.4,
    lowSurface: "story.lit.low",
    lowPaint: "accent",
    lowRadius: 0.08,
    lowX: -1,
    lowY: 0,
    lowZ: 0,
    lowFrom: "silhouette",
    highW: 0.9,
    highH: 0.9,
    highSurface: "story.lit.high",
    highPaint: "alert",
    highRadius: 0.5,
    highX: 1.1,
    highY: 0.1,
    highZ: 3,
    highFrom: "silhouette",
  },
  argTypes: {
    angle: documented("arg.light.angle", { control: { type: "range", min: 0, max: 360, step: 5 } }, "desk/lit.light"),
    frame: documented("arg.frame", { control: "select", options: ["viewer", "world"] }, "desk/lit.light"),
    base: documented("arg.shadow.base", { control: { type: "range", min: 0, max: 0.3, step: 0.01 } }, "desk/lit.shadow"),
    perZ: documented("arg.shadow.perZ", { control: { type: "range", min: 0, max: 0.2, step: 0.005 } }, "desk/lit.shadow"),
    lifted: documented("arg.shadow.lifted", { control: { type: "range", min: 0, max: 0.5, step: 0.01 } }, "desk/lit.shadow"),
    opacity: documented("arg.shadow.opacity", { control: { type: "range", min: 0, max: 1, step: 0.02 } }, "desk/lit.shadow"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    lowW: documented("arg.w", SIZE, "low card/bounds"),
    lowH: documented("arg.h", SIZE, "low card/bounds"),
    lowSurface: documented("arg.registerAs", TOKEN, "low card/surface"),
    lowPaint: documented("arg.fill", PAINT, "low card/surface"),
    lowRadius: documented("arg.radius", RADIUS, "low card/surface"),
    lowX: documented("arg.x", PLACE, "low card/transformable"),
    lowY: documented("arg.y", PLACE, "low card/transformable"),
    lowZ: documented("arg.z", HEIGHT, "low card/transformable"),
    lowFrom: documented("arg.from", CONTOUR, "low card/shadowCaster"),
    highW: documented("arg.w", SIZE, "high token/bounds"),
    highH: documented("arg.h", SIZE, "high token/bounds"),
    highSurface: documented("arg.registerAs", TOKEN, "high token/surface"),
    highPaint: documented("arg.fill", PAINT, "high token/surface"),
    highRadius: documented("arg.radius", RADIUS, "high token/surface"),
    highX: documented("arg.x", PLACE, "high token/transformable"),
    highY: documented("arg.y", PLACE, "high token/transformable"),
    highZ: documented("arg.z", HEIGHT, "high token/transformable"),
    highFrom: documented("arg.from", CONTOUR, "high token/shadowCaster"),
  },
  parameters: { gkDocStory: "lit.light" },
};
