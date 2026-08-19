import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  node,
  Oriented,
  rect,
  registerLayout,
  registerSurface,
  rowLayout,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// ORIENTED asks whose axes a turn is measured in. `world` rides the chain like `z` does; `viewer`
// is a TERMINATOR — the node ignores every owner's turn, which is how a caption stays readable on
// a tray somebody sat down sideways. The two stand side by side here on ONE turned tray, because
// the law is only visible as a difference.

const meta: Meta = {
  title: "Atoms/Oriented",
  parameters: {
    gkDoc: "oriented.component",
    gkAtom: "Oriented",
    gkFields: { orientation: ["orientation"] },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };
/** Empty is no atom at all — the node inherits the chain's turn, which is what `world` restates. */
const FRAMES = { control: "select", options: ["", "world", "viewer"] };
/** The stroke's own rows vanish with it — an absent border has no colour to be asked about. */
const STROKED = { if: { arg: "tokenStroke" } };

/** The atom is written only when a frame is named; empty leaves the node bare. */
const framed = (orientation: string) => (orientation ? [Oriented({ orientation: orientation as "world" | "viewer" })] : []);

interface TurnArgs {
  trayAngle: number;
  orientation: string;
  ridesOrientation: string;
  deskLayout: string;
  trayW: number;
  trayH: number;
  trayLayout: string;
  trayGap: number;
  traySurface: string;
  trayPaint: string;
  trayRadius: number;
  trayX: number;
  trayY: number;
  tokenW: number;
  tokenH: number;
  tokenSurface: string;
  tokenPaint: string;
  tokenRadius: number;
  tokenStroke: boolean;
  tokenStrokeColor: string;
  tokenStrokeWidth: number;
  tokenStrokeAlignment: number;
}

export const Billboard: StoryObj<TurnArgs> = {
  // TURN THE TRAY, WATCH THE TWO TOKENS DISAGREE. Both sit in the same turned container with the
  // same own angle of zero. The left one is `world` and goes round with the tray; the right one is
  // `viewer` and stays where the onlooker is, whatever the tray does — the chain stops at it.
  render: ({
    trayAngle,
    orientation,
    ridesOrientation,
    deskLayout,
    trayW,
    trayH,
    trayLayout,
    trayGap,
    traySurface,
    trayPaint,
    trayRadius,
    trayX,
    trayY,
    tokenW,
    tokenH,
    tokenSurface,
    tokenPaint,
    tokenRadius,
    tokenStroke,
    tokenStrokeColor,
    tokenStrokeWidth,
    tokenStrokeAlignment,
  }) => {
    registerSurface(traySurface, { layers: [{ paint: trayPaint }], radius: trayRadius });
    registerSurface(tokenSurface, {
      layers: [{ paint: tokenPaint }],
      radius: tokenRadius,
      ...(tokenStroke ? { stroke: { color: tokenStrokeColor, width: tokenStrokeWidth, alignment: tokenStrokeAlignment } } : {}),
    });
    registerLayout(deskLayout, freeLayout);
    registerLayout(trayLayout, rowLayout({ gap: trayGap }));

    const desk = node("desk", Container({ layout: deskLayout }));
    const tray = node(
      "tray",
      Bounded({ bounds: rect(trayW, trayH) }),
      Surfaced({ surface: traySurface }),
      Container({ layout: trayLayout }),
      Transformable({ at: { x: trayX, y: trayY }, angle: trayAngle }),
    );
    add(desk, tray);
    // Same box, same own angle. The only difference between them is the frame they are read in.
    add(
      tray,
      node("rides", Bounded({ bounds: rect(tokenW, tokenH) }), Surfaced({ surface: tokenSurface }), ...framed(ridesOrientation)),
    );
    add(
      tray,
      node("framed", Bounded({ bounds: rect(tokenW, tokenH) }), Surfaced({ surface: tokenSurface }), ...framed(orientation)),
    );
    return scene(desk).el;
  },
  args: {
    trayAngle: 30,
    orientation: "viewer",
    ridesOrientation: "",
    deskLayout: "story.oriented.free",
    trayW: 4.2,
    trayH: 1.6,
    trayLayout: "story.oriented.row",
    trayGap: 0.4,
    traySurface: "story.oriented.tray",
    trayPaint: "sunkBg",
    trayRadius: 0.1,
    trayX: 0,
    trayY: 0,
    tokenW: 1.5,
    tokenH: 0.9,
    tokenSurface: "story.oriented.token",
    tokenPaint: "panelBg",
    tokenRadius: 0.08,
    tokenStroke: true,
    tokenStrokeColor: "accent",
    tokenStrokeWidth: 0.03,
    tokenStrokeAlignment: 1,
  },
  argTypes: {
    orientation: documented("arg.orientation", FRAMES, "framed token/oriented"),
    ridesOrientation: documented("arg.orientation", FRAMES, "riding token/oriented"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    trayW: documented("arg.w", SIZE, "tray/bounds"),
    trayH: documented("arg.h", SIZE, "tray/bounds"),
    trayLayout: documented("arg.layoutName", TOKEN, "tray/container"),
    trayGap: documented("arg.gap", { control: { type: "number", min: 0, step: 0.02 } }, "tray/container"),
    traySurface: documented("arg.registerAs", TOKEN, "tray/surface"),
    trayPaint: documented("arg.fill", PAINT, "tray/surface"),
    trayRadius: documented("arg.radius", RADIUS, "tray/surface"),
    trayX: documented("arg.x", PLACE, "tray/transformable"),
    trayY: documented("arg.y", PLACE, "tray/transformable"),
    trayAngle: documented("arg.trayAngle", { control: { type: "range", min: -180, max: 180, step: 5 } }, "tray/transformable"),
    tokenW: documented("arg.w", SIZE, "tokens/bounds"),
    tokenH: documented("arg.h", SIZE, "tokens/bounds"),
    tokenSurface: documented("arg.registerAs", TOKEN, "tokens/surface"),
    tokenPaint: documented("arg.fill", PAINT, "tokens/surface"),
    tokenRadius: documented("arg.radius", RADIUS, "tokens/surface"),
    tokenStroke: documented("arg.stroke", {}, "tokens/surface.stroke"),
    tokenStrokeColor: documented("arg.strokeColor", { ...PAINT, ...STROKED }, "tokens/surface.stroke"),
    tokenStrokeWidth: documented("arg.strokeWidth", { control: { type: "number", min: 0, step: 0.01 }, ...STROKED }, "tokens/surface.stroke"),
    tokenStrokeAlignment: documented("arg.alignment", { control: { type: "range", min: 0, max: 1, step: 0.5 }, ...STROKED }, "tokens/surface.stroke"),
  },
  parameters: { gkDocStory: "oriented.billboard" },
};
