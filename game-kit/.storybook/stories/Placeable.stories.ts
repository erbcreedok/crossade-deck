import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  node,
  Placeable,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// PLACEABLE is a MARKER: presence says "this can be set into a slot", absence declines — there
// is no second field to disagree with it. It requires `Bounded`, because a thing set into a slot
// needs a footprint the slot can seat. What reads it is the move machinery (`planMove` and the
// slot layouts); what it never does is draw, which is why this scene teaches by contrast and by
// the debug outline rather than by paint.

const meta: Meta = {
  title: "Atoms/Placeable",
  parameters: {
    gkDoc: "placeable.component",
    gkAtom: "Placeable",
    // The atom has NO fields — presence is the whole answer, and the two tokens side by side
    // are the control: one carries the marker, one does not.
    gkFields: {},
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };

interface MarkerArgs {
  deskLayout: string;
  tokenSurface: string;
  tokenPaint: string;
  tokenRadius: number;
  seatableW: number;
  seatableH: number;
  seatableX: number;
  seatableY: number;
  seatablePlaceable: boolean;
  looseW: number;
  looseH: number;
  looseX: number;
  looseY: number;
  loosePlaceable: boolean;
}

export const Marker: StoryObj<MarkerArgs> = {
  // TWO IDENTICAL TOKENS, one difference a renderer cannot show: the left one carries `Placeable`,
  // the right one does not. Nothing on the glass differs — the marker draws nothing — and that is
  // the lesson: what changes is the ANSWER the move machinery gets when it asks whether a slot
  // may seat this. Open the Node tree panel to see the capability on the left token.
  render: ({
    deskLayout,
    tokenSurface,
    tokenPaint,
    tokenRadius,
    seatableW,
    seatableH,
    seatableX,
    seatableY,
    seatablePlaceable,
    looseW,
    looseH,
    looseX,
    looseY,
    loosePlaceable,
  }) => {
    registerSurface(tokenSurface, { layers: [{ paint: tokenPaint }], radius: tokenRadius });
    registerLayout(deskLayout, freeLayout);
    const desk = node("desk", Container({ layout: deskLayout }));
    add(
      desk,
      node(
        "seatable",
        Bounded({ bounds: rect(seatableW, seatableH) }),
        Surfaced({ surface: tokenSurface }),
        Transformable({ at: { x: seatableX, y: seatableY } }),
        ...(seatablePlaceable ? [Placeable()] : []),
      ),
    );
    add(
      desk,
      node(
        "loose",
        Bounded({ bounds: rect(looseW, looseH) }),
        Surfaced({ surface: tokenSurface }),
        Transformable({ at: { x: looseX, y: looseY } }),
        ...(loosePlaceable ? [Placeable()] : []),
      ),
    );
    return scene(desk).el;
  },
  args: {
    deskLayout: "story.placeable.free",
    tokenSurface: "story.placeable.token",
    tokenPaint: "accent",
    tokenRadius: 0.5,
    seatableW: 0.9,
    seatableH: 0.9,
    seatableX: -0.9,
    seatableY: 0,
    seatablePlaceable: true,
    looseW: 0.9,
    looseH: 0.9,
    looseX: 0.9,
    looseY: 0,
    loosePlaceable: false,
  },
  argTypes: {
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    tokenSurface: documented("arg.registerAs", TOKEN, "tokens/surface"),
    tokenPaint: documented("arg.fill", PAINT, "tokens/surface"),
    tokenRadius: documented("arg.radius", RADIUS, "tokens/surface"),
    seatableW: documented("arg.w", SIZE, "seatable token/bounds"),
    seatableH: documented("arg.h", SIZE, "seatable token/bounds"),
    seatableX: documented("arg.x", PLACE, "seatable token/transformable"),
    seatableY: documented("arg.y", PLACE, "seatable token/transformable"),
    seatablePlaceable: documented("arg.placeable", {}, "seatable token/placeable"),
    looseW: documented("arg.w", SIZE, "loose token/bounds"),
    looseH: documented("arg.h", SIZE, "loose token/bounds"),
    looseX: documented("arg.x", PLACE, "loose token/transformable"),
    looseY: documented("arg.y", PLACE, "loose token/transformable"),
    loosePlaceable: documented("arg.placeable", {}, "loose token/placeable"),
  },
  parameters: { gkDocStory: "placeable.marker" },
};
