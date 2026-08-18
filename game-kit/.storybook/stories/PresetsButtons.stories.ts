import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  button,
  byId,
  compose,
  Container,
  CONTROL_BAR,
  CONTROL_LABEL,
  CONTROL_LOOKS,
  freeLayout,
  installStockControls,
  Labeled,
  node,
  rect,
  registerLayout,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// A BUTTON IS ONE LINE. Everything a control needs already has an answer — the look, the box, the
// caption's role, what it wears under a finger — so the only things a caller says are the words and
// what a press means. The looks are registry NAMES, so a fifth one is a `registerSurface` in a
// game's own file and never a branch in the kit.

const meta: Meta = {
  title: "Presets/Components",
  parameters: { gkDoc: "hudButton.component" },
};
export default meta;

interface BarArgs {
  label: string;
  look: string;
  sink: number;
  nudge: number;
  shadow: boolean;
}

export const Buttons: StoryObj<BarArgs> = {
  // Four controls, one call each. `look` is the only thing that differs between them, and it is a
  // name — swap `danger` for a record of your own and the same call wears it.
  render: (a) => {
    installStockControls();
    registerLayout("story.controls.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.controls.free" }));
    const bar = node("bar", Container({ layout: CONTROL_BAR }), Transformable({ at: { x: 0, y: -0.5 } }));
    add(bar, button("undo", { label: a.label, look: a.look, means: { does: "undo" }, sink: a.sink, nudge: { x: a.nudge, y: a.nudge }, ...(a.shadow ? { shadow: "silhouette" as const } : {}) }));
    add(bar, button("again", { label: "Again", look: "quiet", means: { does: "restart" } }));
    add(bar, button("discard", { label: "Discard", look: "danger", means: { does: "discard" } }));
    add(bar, button("more", { label: "More", look: "ghost", means: { does: "more" } }));
    add(desk, bar);
    add(desk, node("said", Bounded({ bounds: rect(5, 0.5) }), Labeled({ label: "press one", style: CONTROL_LABEL }), Transformable({ at: { x: 0, y: 0.7 } })));
    // WIRED, because a control story that only DREW its controls would teach a picture: the hover,
    // the sink and the press are the whole of what a reader came to feel. What comes back is the
    // MEANING the spec put on the node — never the id, which the kit treats as opaque.
    const live = scene(desk, {
      press: (meaning) => {
        const said = byId(live.host.root, "said");
        if (!said) return;
        compose(said, Labeled({ label: `pressed: ${String(meaning["does"])}`, style: CONTROL_LABEL }));
        live.setRoot(live.host.root);
      },
    });
    return live.el;
  },
  args: { label: "Undo", look: "primary", sink: -0.6, nudge: 0.04, shadow: true },
  argTypes: {
    label: documented("arg.label", { control: "text" }, "words"),
    look: documented("arg.look", { control: "select", options: [...CONTROL_LOOKS] }, "look"),
    sink: documented("arg.sink", { control: { type: "range", min: -2, max: 0, step: 0.1 } }, "press"),
    nudge: documented("arg.nudge", { control: { type: "number", step: 0.01 } }, "press"),
    shadow: documented("arg.castShadow", {}, "look"),
  },
  parameters: { gkDocStory: "hudButton.bar" },
};
