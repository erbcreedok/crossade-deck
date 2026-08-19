import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  node,
  Pressable,
  rect,
  registerLayout,
  registerSurface,
  registerTextStyle,
  Labeled,
  Surfaced,
  Transformable,
  Valued,
  type Coat,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// PRESSABLE says an element answers a finger, and declares what it WEARS while one is near it. It
// is the look and the depth, never the meaning: what a press DOES is `Valued`, read by whoever
// handles it — the same split `Inviting` keeps between the coat and the zone's legality.

const meta: Meta = {
  title: "Atoms/Pressable",
  parameters: {
    gkDoc: "pressable.component",
    gkAtom: "Pressable",
    gkFields: { hover: ["Control"], held: ["Control"], sink: ["Control"], nudge: ["Control"] },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };
const EM = { control: { type: "number", min: 0, step: 0.02 } };
const LEVEL = { control: { type: "range", min: 0, max: 1, step: 0.02 } };
/** The stroke's own rows vanish with it — an absent border has no colour to be asked about. */
const STROKED = { if: { arg: "plateStroke" } };

const coat = (recipe: string, level: number, tint: string): Coat => ({ recipe, level, tint });

interface ControlArgs {
  deskLayout: string;
  controlW: number;
  controlH: number;
  plateSurface: string;
  platePaint: string;
  plateRadius: number;
  plateStroke: boolean;
  plateStrokeColor: string;
  plateStrokeWidth: number;
  labelStyle: string;
  labelFamily: string;
  labelSize: number;
  labelWeight: number;
  labelLineHeight: number;
  labelFill: string;
  hoverRecipe: string;
  hoverLevel: number;
  hoverTint: string;
  heldRecipe: string;
  heldLevel: number;
  heldTint: string;
  sink: number;
  nudgeX: number;
  nudgeY: number;
  undoLabel: string;
  undoDoes: string;
  undoX: number;
  hintLabel: string;
  hintDoes: string;
  hintX: number;
  muteLabel: string;
  muteX: number;
}

export const Control: StoryObj<ControlArgs> = {
  // Three controls, the same assembly. Move the pointer over one to see `hover`, hold it to see
  // `held`, `sink` and `nudge` at once. The third declares no `Valued` — it lights and sinks and
  // reports nothing, which is a legitimate control: a spacer that still feels alive under a finger.
  render: ({
    deskLayout,
    controlW,
    controlH,
    plateSurface,
    platePaint,
    plateRadius,
    plateStroke,
    plateStrokeColor,
    plateStrokeWidth,
    labelStyle,
    labelFamily,
    labelSize,
    labelWeight,
    labelLineHeight,
    labelFill,
    hoverRecipe,
    hoverLevel,
    hoverTint,
    heldRecipe,
    heldLevel,
    heldTint,
    sink,
    nudgeX,
    nudgeY,
    undoLabel,
    undoDoes,
    undoX,
    hintLabel,
    hintDoes,
    hintX,
    muteLabel,
    muteX,
  }) => {
    registerSurface(plateSurface, {
      layers: [{ paint: platePaint }],
      radius: plateRadius,
      ...(plateStroke ? { stroke: { color: plateStrokeColor, width: plateStrokeWidth } } : {}),
    });
    registerTextStyle(labelStyle, { family: labelFamily, size: labelSize, weight: labelWeight, lineHeight: labelLineHeight, fill: labelFill });
    registerLayout(deskLayout, freeLayout);
    const desk = node("desk", Container({ layout: deskLayout }));
    const control = (id: string, x: number, label: string, means?: Record<string, unknown>) =>
      node(
        id,
        Bounded({ bounds: rect(controlW, controlH) }),
        Surfaced({ surface: plateSurface }),
        Labeled({ label, style: labelStyle }),
        Transformable({ at: { x, y: 0 } }),
        Pressable({
          hover: coat(hoverRecipe, hoverLevel, hoverTint),
          held: coat(heldRecipe, heldLevel, heldTint),
          sink,
          nudge: { x: nudgeX, y: nudgeY },
        }),
        ...(means ? [Valued({ values: means })] : []),
      );
    add(desk, control("undo", undoX, undoLabel, { does: undoDoes }));
    add(desk, control("hint", hintX, hintLabel, { does: hintDoes }));
    add(desk, control("mute", muteX, muteLabel));
    return scene(desk, { press: () => undefined }).el;
  },
  args: {
    deskLayout: "story.press.row",
    controlW: 1.7,
    controlH: 0.66,
    plateSurface: "story.press.plate",
    platePaint: "panelBg",
    plateRadius: 0.1,
    plateStroke: true,
    plateStrokeColor: "panelBorder",
    plateStrokeWidth: 0.02,
    labelStyle: "story.press.label",
    labelFamily: "ui-sans-serif, system-ui, sans-serif",
    labelSize: 0.2,
    labelWeight: 500,
    labelLineHeight: 1.2,
    labelFill: "text",
    hoverRecipe: "wash",
    hoverLevel: 0.12,
    hoverTint: "text",
    heldRecipe: "wash",
    heldLevel: 0.22,
    heldTint: "shadow",
    sink: -0.6,
    nudgeX: 0.04,
    nudgeY: 0.04,
    undoLabel: "Undo",
    undoDoes: "undo",
    undoX: -1.9,
    hintLabel: "Hint",
    hintDoes: "hint",
    hintX: 0,
    muteLabel: "Says nothing",
    muteX: 1.9,
  },
  argTypes: {
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    controlW: documented("arg.w", SIZE, "controls/bounds"),
    controlH: documented("arg.h", SIZE, "controls/bounds"),
    plateSurface: documented("arg.registerAs", TOKEN, "controls/surface"),
    platePaint: documented("arg.fill", PAINT, "controls/surface"),
    plateRadius: documented("arg.radius", RADIUS, "controls/surface"),
    plateStroke: documented("arg.stroke", {}, "controls/surface.stroke"),
    plateStrokeColor: documented("arg.strokeColor", { ...PAINT, ...STROKED }, "controls/surface.stroke"),
    plateStrokeWidth: documented("arg.strokeWidth", { control: { type: "number", min: 0, step: 0.01 }, ...STROKED }, "controls/surface.stroke"),
    labelStyle: documented("arg.registerAs", TOKEN, "controls/text style"),
    labelFamily: documented("arg.text.family", TOKEN, "controls/text style"),
    labelSize: documented("arg.text.size", EM, "controls/text style"),
    labelWeight: documented("arg.text.weight", { control: { type: "range", min: 100, max: 900, step: 100 } }, "controls/text style"),
    labelLineHeight: documented("arg.text.lineHeight", { control: { type: "number", min: 0, step: 0.05 } }, "controls/text style"),
    labelFill: documented("arg.text.fill", PAINT, "controls/text style"),
    hoverRecipe: documented("arg.hover", TOKEN, "controls/pressable.hover"),
    hoverLevel: documented("arg.coatLevel", { ...LEVEL, if: { arg: "hoverRecipe", neq: "" } }, "controls/pressable.hover"),
    hoverTint: documented("arg.coatTint", { control: "select", options: ["", ...PAINTS], if: { arg: "hoverRecipe", neq: "" } }, "controls/pressable.hover"),
    heldRecipe: documented("arg.held", TOKEN, "controls/pressable.held"),
    heldLevel: documented("arg.coatLevel", { ...LEVEL, if: { arg: "heldRecipe", neq: "" } }, "controls/pressable.held"),
    heldTint: documented("arg.coatTint", { control: "select", options: ["", ...PAINTS], if: { arg: "heldRecipe", neq: "" } }, "controls/pressable.held"),
    sink: documented("arg.sink", { control: { type: "range", min: -2, max: 0, step: 0.1 } }, "controls/pressable.sink"),
    nudgeX: documented("arg.nudge", { control: { type: "number", step: 0.01 } }, "controls/pressable.nudge"),
    nudgeY: documented("arg.nudge", { control: { type: "number", step: 0.01 } }, "controls/pressable.nudge"),
    undoLabel: documented("arg.label", { control: "text" }, "undo/labeled"),
    undoDoes: documented("arg.does", TOKEN, "undo/valued"),
    undoX: documented("arg.x", PLACE, "undo/transformable"),
    hintLabel: documented("arg.label", { control: "text" }, "hint/labeled"),
    hintDoes: documented("arg.does", TOKEN, "hint/valued"),
    hintX: documented("arg.x", PLACE, "hint/transformable"),
    muteLabel: documented("arg.label", { control: "text" }, "mute/labeled"),
    muteX: documented("arg.x", PLACE, "mute/transformable"),
  },
  parameters: { gkDocStory: "pressable.control" },
};
