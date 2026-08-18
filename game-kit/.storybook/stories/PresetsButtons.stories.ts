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
  LARGE,
  PILL,
  ROUND,
  rowLayout,
  SMALL,
  SQUARE,
  type Node,
  Labeled,
  node,
  rect,
  registerLayout,
  Transformable,
} from "../../src/index.js";
import { installStockAssets } from "./stockAssets.js";
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

interface GalleryArgs {
  asleep: boolean;
}

export const Gallery: StoryObj<GalleryArgs> = {
  // EVERY CONTROL HERE IS ONE `button()` CALL. What differs between rows is which registered look it
  // wears and which shape it was given — never a branch, never a sort, and never a second preset.
  render: (a) => {
    installStockControls();
    installStockAssets();
    registerLayout("story.gallery.free", freeLayout);
    registerLayout("story.gallery.row", rowLayout({ gap: 0.2, padding: 0 }));
    const desk = node("desk", Container({ layout: "story.gallery.free" }));

    const row = (id: string, y: number, made: readonly Node[]): void => {
      const bar = node(id, Container({ layout: "story.gallery.row" }), Transformable({ at: { x: 0, y } }));
      for (const one of made) add(bar, one);
      add(desk, bar);
    };

    const sleepy = a.asleep ? { asleep: true } : {};

    // WEIGHT — the same words at five levels of emphasis. One field apart.
    row("weight", -1.5, ["primary", "outline", "quiet", "sunk", "ghost"].map((look) =>
      button(`w/${look}`, { look, label: look, means: { does: look }, ...sleepy })));

    // SIZE and SHAPE — a box is a `Shape`, so a pill and a small control are not special cases.
    row("size", -0.55, [
      button("s/small", { bounds: SMALL(), label: "Small", means: { does: "small" }, ...sleepy }),
      button("s/medium", { label: "Medium", means: { does: "medium" }, ...sleepy }),
      button("s/large", { bounds: LARGE(), label: "Large", means: { does: "large" }, ...sleepy }),
      button("s/pill", { bounds: PILL(2.2), look: "outline", label: "Pill", means: { does: "pill" }, ...sleepy }),
    ]);

    // ICONS — a picture by asset name, alone or beside words. An icon button is a square one.
    row("icons", 0.45, [
      button("i/square", { bounds: SQUARE(0.8), icon: "emblem", means: { does: "square" }, ...sleepy }),
      button("i/round", { bounds: ROUND(0.4), look: "quiet", icon: "emblem", means: { does: "round" }, ...sleepy }),
      button("i/wide", { bounds: LARGE(), look: "outline", icon: "emblem", iconSize: 0.4, label: "With a mark", means: { does: "wide" }, ...sleepy }),
      button("i/danger", { look: "danger", label: "Discard", means: { does: "discard" }, ...sleepy }),
    ]);

    add(desk, node("said", Bounded({ bounds: rect(6, 0.5) }), Labeled({ label: "press any of them", style: CONTROL_LABEL }), Transformable({ at: { x: 0, y: 1.5 } })));
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
  args: { asleep: false },
  argTypes: { asleep: documented("arg.asleep", {}, "state") },
  parameters: { gkDocStory: "hudButton.bar" },
};
