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
import { documented } from "./surfaceControls.js";

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

interface TurnArgs {
  trayAngle: number;
  orientation: "world" | "viewer";
}

export const Billboard: StoryObj<TurnArgs> = {
  // TURN THE TRAY, WATCH THE TWO TOKENS DISAGREE. Both sit in the same turned container with the
  // same own angle of zero. The left one is `world` and goes round with the tray; the right one is
  // `viewer` and stays where the onlooker is, whatever the tray does — the chain stops at it.
  render: (a) => {
    registerSurface("story.oriented.tray", { layers: [{ paint: "sunkBg" }], radius: 0.1 });
    registerSurface("story.oriented.token", { layers: [{ paint: "panelBg" }], radius: 0.08, stroke: { color: "accent", width: 0.03, alignment: 1 } });
    registerLayout("story.oriented.free", freeLayout);
    registerLayout("story.oriented.row", rowLayout({ gap: 0.4 }));

    const desk = node("desk", Container({ layout: "story.oriented.free" }));
    const tray = node(
      "tray",
      Bounded({ bounds: rect(4.2, 1.6) }),
      Surfaced({ surface: "story.oriented.tray" }),
      Container({ layout: "story.oriented.row" }),
      Transformable({ at: { x: 0, y: 0 }, angle: a.trayAngle }),
    );
    add(desk, tray);
    // Same box, same own angle. The only difference between them is the frame they are read in.
    add(tray, node("rides", Bounded({ bounds: rect(1.5, 0.9) }), Surfaced({ surface: "story.oriented.token" })));
    add(
      tray,
      node(
        "framed",
        Bounded({ bounds: rect(1.5, 0.9) }),
        Surfaced({ surface: "story.oriented.token" }),
        Oriented({ orientation: a.orientation }),
      ),
    );
    return scene(desk).el;
  },
  args: { trayAngle: 30, orientation: "viewer" },
  argTypes: {
    trayAngle: documented("arg.trayAngle", { control: { type: "range", min: -180, max: 180, step: 5 } }, "orientation"),
    orientation: documented("arg.orientation", { control: { type: "inline-radio" }, options: ["world", "viewer"] }, "orientation"),
  },
  parameters: { gkDocStory: "oriented.billboard" },
};
