import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  Labeled,
  node,
  rect,
  registerLayout,
  registerSurface,
  registerTextStyle,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// LABELED carries a caption ALREADY WRITTEN in the viewer's language. The kit paints no string a
// player could read and knows no notion of a language — the caption arrives on the node, and
// whoever draws text (a HUD widget, a tooltip, the catalog's own tree panel) reads it from here.
// That is the whole atom: a store for words the consumer localized before they got in.

const meta: Meta = {
  title: "Atoms/Labeled",
  parameters: {
    gkDoc: "labeled.component",
    gkAtom: "Labeled",
    gkFields: { label: ["Caption"], style: ["style"] },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };
const EM = { control: { type: "number", min: 0, step: 0.02 } };
const WEIGHT = { control: { type: "range", min: 100, max: 900, step: 100 } };
const LEADING = { control: { type: "number", min: 0, step: 0.05 } };

interface CaptionArgs {
  label: string;
  style: string;
  deskLayout: string;
  buttonW: number;
  buttonH: number;
  buttonSurface: string;
  buttonPaint: string;
  buttonRadius: number;
  buttonX: number;
  buttonY: number;
  plainName: string;
  plainFamily: string;
  plainSize: number;
  plainWeight: number;
  plainLineHeight: number;
  plainFill: string;
  loudName: string;
  loudFamily: string;
  loudSize: number;
  loudWeight: number;
  loudLineHeight: number;
  loudFill: string;
}

export const Caption: StoryObj<CaptionArgs> = {
  // A BUTTON-ON-THE-DESK with its caption as data, drawn on the glass. `style` names a ROLE, never
  // a font: a role is what a tree can say and a designer can re-decide, while the family and the
  // size are the theme's answer. Two roles are registered here to make the difference visible, and
  // a name nobody registered falls back to the desk's face rather than throwing — try typing one.
  render: ({
    label,
    style,
    deskLayout,
    buttonW,
    buttonH,
    buttonSurface,
    buttonPaint,
    buttonRadius,
    buttonX,
    buttonY,
    plainName,
    plainFamily,
    plainSize,
    plainWeight,
    plainLineHeight,
    plainFill,
    loudName,
    loudFamily,
    loudSize,
    loudWeight,
    loudLineHeight,
    loudFill,
  }) => {
    registerSurface(buttonSurface, { layers: [{ paint: buttonPaint }], radius: buttonRadius });
    registerTextStyle(plainName, { family: plainFamily, size: plainSize, weight: plainWeight, lineHeight: plainLineHeight, fill: plainFill });
    registerTextStyle(loudName, { family: loudFamily, size: loudSize, weight: loudWeight, lineHeight: loudLineHeight, fill: loudFill });
    registerLayout(deskLayout, freeLayout);
    const desk = node("desk", Container({ layout: deskLayout }));
    add(
      desk,
      node(
        "attackButton",
        Bounded({ bounds: rect(buttonW, buttonH) }),
        Surfaced({ surface: buttonSurface }),
        Transformable({ at: { x: buttonX, y: buttonY } }),
        Labeled({ label, style }),
      ),
    );
    return scene(desk).el;
  },
  args: {
    label: "Attack",
    style: "story.labeled.plain",
    deskLayout: "story.labeled.free",
    buttonW: 1.8,
    buttonH: 0.7,
    buttonSurface: "story.labeled.button",
    buttonPaint: "accent",
    buttonRadius: 0.2,
    buttonX: 0,
    buttonY: 0,
    plainName: "story.labeled.plain",
    plainFamily: "ui-sans-serif, system-ui, sans-serif",
    plainSize: 0.18,
    plainWeight: 400,
    plainLineHeight: 1.25,
    plainFill: "panelBg",
    loudName: "story.labeled.loud",
    loudFamily: "ui-serif, Georgia, serif",
    loudSize: 0.3,
    loudWeight: 700,
    loudLineHeight: 1.2,
    loudFill: "panelBg",
  },
  argTypes: {
    label: documented("arg.label", { control: "text" }, "attack button/labeled"),
    style: documented("arg.style", TOKEN, "attack button/labeled"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    buttonW: documented("arg.w", SIZE, "attack button/bounds"),
    buttonH: documented("arg.h", SIZE, "attack button/bounds"),
    buttonSurface: documented("arg.registerAs", TOKEN, "attack button/surface"),
    buttonPaint: documented("arg.fill", PAINT, "attack button/surface"),
    buttonRadius: documented("arg.radius", RADIUS, "attack button/surface"),
    buttonX: documented("arg.x", PLACE, "attack button/transformable"),
    buttonY: documented("arg.y", PLACE, "attack button/transformable"),
    plainName: documented("arg.registerAs", TOKEN, "plain role/text style"),
    plainFamily: documented("arg.text.family", TOKEN, "plain role/text style"),
    plainSize: documented("arg.text.size", EM, "plain role/text style"),
    plainWeight: documented("arg.text.weight", WEIGHT, "plain role/text style"),
    plainLineHeight: documented("arg.text.lineHeight", LEADING, "plain role/text style"),
    plainFill: documented("arg.text.fill", PAINT, "plain role/text style"),
    loudName: documented("arg.registerAs", TOKEN, "loud role/text style"),
    loudFamily: documented("arg.text.family", TOKEN, "loud role/text style"),
    loudSize: documented("arg.text.size", EM, "loud role/text style"),
    loudWeight: documented("arg.text.weight", WEIGHT, "loud role/text style"),
    loudLineHeight: documented("arg.text.lineHeight", LEADING, "loud role/text style"),
    loudFill: documented("arg.text.fill", PAINT, "loud role/text style"),
  },
  parameters: { gkDocStory: "labeled.caption" },
};
