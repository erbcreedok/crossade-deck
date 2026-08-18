import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  button,
  byId,
  compose,
  Container,
  freeLayout,
  Labeled,
  node,
  Transformable,
  rect,
  registerLayout,
  registerSurface,
  registerTextStyle,
  rowLayout,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// A BUTTON is one literal of data assembled into an element — the same bargain `pile()` strikes,
// for the other thing every game grows. The press wiring is the kit's too (`wireButtons`), and it
// is the one gesture the kit will own: "down on me and up on me" means the same in every game.

const meta: Meta = {
  title: "HUD/Button",
  parameters: { gkDoc: "hudButton.component" },
};
export default meta;

interface BarArgs {
  label: string;
  surface: string;
  face: string;
  inset: number;
  sink: number;
  nudge: number;
  shadow: boolean;
}

export const Bar: StoryObj<BarArgs> = {
  // A row of controls, each one a `button()` call and nothing else. The ring between the plate and
  // the face is the SECOND node the preset builds when a look asks for two strokes — take `face`
  // away and the same call returns one node with one stroke, which is what most looks want.
  render: (a) => {
    registerSurface("ui/plate", { layers: [{ paint: "accent" }], radius: 0.12 });
    registerSurface("ui/face", { layers: [{ paint: "panelBg" }], radius: 0.09, stroke: { color: "panelBorder", width: 0.02, alignment: 1 } });
    registerTextStyle("ui/label", { family: "ui-sans-serif, system-ui, sans-serif", size: 0.19, weight: 600, lineHeight: 1.2, fill: "text" });
    registerLayout("ui/bar", rowLayout({ gap: 0.18, padding: 0 }));
    registerLayout("ui/free", freeLayout);
    const desk = node("desk", Container({ layout: "ui/free" }));
    const bar = node("bar", Container({ layout: "ui/bar" }), Transformable({ at: { x: 0, y: -0.5 } }));
    const spec = (id: string, label: string, does: string) =>
      button(id, {
        bounds: rect(1.7, 0.66),
        surface: a.surface,
        ...(a.face ? { face: a.face, inset: a.inset } : {}),
        label,
        style: "ui/label",
        means: { does },
        sink: a.sink,
        nudge: { x: a.nudge, y: a.nudge },
        ...(a.shadow ? { shadow: "silhouette" as const } : {}),
      });
    add(bar, spec("undo", a.label, "undo"));
    add(bar, spec("again", "Again", "restart"));
    add(bar, spec("hint", "Hint", "hint"));
    add(desk, bar);
    add(desk, node("said", Bounded({ bounds: rect(5, 0.5) }), Labeled({ label: "press one", style: "ui/label" }), Transformable({ at: { x: 0, y: 0.7 } })));
    // WIRED, because a control story that only DREW its controls would teach a picture: the hover,
    // the sink and the press are the whole of what a reader came to feel. What comes back is the
    // MEANING the spec put on the node — never the id, which the kit treats as opaque.
    const live = scene(desk, {
      press: (meaning) => {
        const said = byId(live.host.root, "said");
        if (!said) return;
        compose(said, Labeled({ label: `pressed: ${String(meaning["does"])}`, style: "ui/label" }));
        live.setRoot(live.host.root);
      },
    });
    return live.el;
  },
  args: { label: "Undo", surface: "ui/plate", face: "ui/face", inset: 0.05, sink: -0.6, nudge: 0.04, shadow: true },
  argTypes: {
    label: documented("arg.label", { control: "text" }, "words"),
    surface: documented("arg.plateSurface", { control: "text" }, "look"),
    face: documented("arg.faceSurface", { control: "text" }, "look"),
    inset: documented("arg.inset", { control: { type: "number", min: 0, step: 0.01 } }, "look"),
    sink: documented("arg.sink", { control: { type: "range", min: -2, max: 0, step: 0.1 } }, "press"),
    nudge: documented("arg.nudge", { control: { type: "number", step: 0.01 } }, "press"),
    shadow: documented("arg.castShadow", {}, "look"),
  },
  parameters: { gkDocStory: "hudButton.bar" },
};
