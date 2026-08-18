import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  button,
  byId,
  compose,
  Container,
  CONTROL_BAR,
  CONTROL_H,
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
  title: "HUD/Button",
  parameters: { gkDoc: "hudButton.component" },
};
export default meta;

interface GalleryArgs {
  asleep: boolean;
  fill: string;
  border: string;
  borderWidth: number;
  radius: number;
}

export const Button: StoryObj<GalleryArgs> = {
  // EVERY CONTROL HERE IS ONE `button()` CALL. What differs between rows is which registered look it
  // wears and which shape it was given — never a branch, never a sort, and never a second preset.
  render: (a) => {
    installStockControls();
    installStockAssets();
    registerLayout("story.gallery.free", freeLayout);
    registerLayout("story.gallery.row", rowLayout({ gap: 0.12, padding: 0 }));
    const desk = node("desk", Container({ layout: "story.gallery.free" }));

    const row = (id: string, y: number, made: readonly Node[]): void => {
      const bar = node(id, Container({ layout: "story.gallery.row" }), Transformable({ at: { x: 0, y } }));
      for (const one of made) add(bar, one);
      add(desk, bar);
    };

    const sleepy = a.asleep ? { asleep: true } : {};
    const skin = { fill: a.fill, border: a.border, borderWidth: a.borderWidth, radius: a.radius };

    // WEIGHT — the same words at five levels of emphasis. One field apart.
    row("weight", -0.75, ["primary", "outline", "quiet", "sunk", "ghost"].map((look) =>
      button(`w/${look}`, { look, label: look, means: { does: look }, ...sleepy })));

    // SIZE and SHAPE — a box is a `Shape`, so a pill and a small control are not special cases.
    row("size", -0.25, [
      button("s/small", { bounds: SMALL(), label: "Small", means: { does: "small" }, ...sleepy }),
      button("s/medium", { label: "Medium", means: { does: "medium" }, ...sleepy }),
      button("s/large", { bounds: LARGE(), label: "Large", means: { does: "large" }, ...sleepy }),
      button("s/pill", { bounds: PILL(1.1), look: "outline", label: "Pill", means: { does: "pill" }, ...sleepy }),
    ]);

    // ICONS — a picture by asset name, alone or beside words. An icon button is a square one.
    row("icons", 0.25, [
      button("i/square", { bounds: SQUARE(0.34), icon: "emblem", means: { does: "square" }, ...sleepy }),
      button("i/round", { bounds: ROUND(0.17), look: "quiet", icon: "emblem", means: { does: "round" }, ...sleepy }),
      button("i/wide", { bounds: LARGE(), look: "outline", icon: "emblem", iconSize: 0.2, label: "With a mark", means: { does: "wide" }, ...sleepy }),
      button("i/danger", { look: "danger", label: "Discard", means: { does: "discard" }, ...sleepy }),
    ]);

    // WRITTEN OUT — the four knobs a designer actually reaches for, on one row: a background or
    // none, a border or none, how thick, how round. No name in the middle.
    row("skin", 0.75, [
      button("k/one", { skin, label: "Your skin", means: { does: "skin" }, ...sleepy }),
      button("k/pill", { skin: { ...skin, radius: CONTROL_H / 2 }, bounds: PILL(1.1), label: "Rounder", means: { does: "rounder" }, ...sleepy }),
      button("k/square", { skin: { ...skin, radius: 0 }, label: "Square", means: { does: "square" }, ...sleepy }),
      button("k/on", { skin, label: "Toggled on", toggled: true, means: { does: "toggled" }, ...sleepy }),
    ]);

    add(desk, node("said", Bounded({ bounds: rect(4, 0.3) }), Labeled({ label: "press any of them", style: CONTROL_LABEL }), Transformable({ at: { x: 0, y: 1.25 } })));
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
  args: { asleep: false, fill: "panelBg", border: "accent", borderWidth: 0.015, radius: 0.05 },
  argTypes: {
    asleep: documented("arg.asleep", {}, "state"),
    fill: documented("arg.fill", { control: "text" }, "skin"),
    border: documented("arg.strokeColor", { control: "text" }, "skin"),
    borderWidth: documented("arg.strokeWidth", { control: { type: "number", min: 0, step: 0.005 } }, "skin"),
    radius: documented("arg.radius", { control: { type: "number", min: 0, step: 0.02 } }, "skin"),
  },
  parameters: { gkDocStory: "hudButton.bar" },
};
