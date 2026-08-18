import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  badge,
  button,
  byId,
  compose,
  Container,
  CONTROL_BAR,
  CONTROL_LABEL,
  freeLayout,
  installStockControls,
  label,
  Labeled,
  node,
  panel,
  rect,
  registerLayout,
  rowLayout,
  slider,
  toggles,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// THE PIECES TOGETHER, as screens rather than as rows of samples. A row of one of everything shows
// that the parts exist; it does not show that they fit. These three are what a game actually puts
// on a table — a toolbar, a pause dialog, a table's own readout — and every node in them is one
// preset call.

const meta: Meta = {
  title: "HUD/Screens",
  parameters: { gkDoc: "hudScreens.component" },
};
export default meta;

interface ScreensArgs {
  pace: string;
  speed: number;
  moves: number;
}

/** The dialog's heading, held in a const because a `title:` in a story file is the LADDER's word. */
const PAUSED = "Paused";

export const Screens: StoryObj<ScreensArgs> = {
  render: (a) => {
    installStockControls();
    registerLayout("screens.free", freeLayout);
    registerLayout("screens.row", rowLayout({ gap: 0.12, padding: 0 }));
    registerLayout("screens.column", rowLayout({ gap: 0.16, padding: 0.18, direction: "column" }));
    const desk = node("desk", Container({ layout: "screens.free" }));

    // A TOOLBAR — what sits over a game while it is played.
    const bar = node("bar", Container({ layout: CONTROL_BAR }), Transformable({ at: { x: 0, y: -1.15 } }));
    add(bar, button("bar/undo", { look: "quiet", label: "Undo", means: { does: "undo" } }));
    add(bar, button("bar/again", { look: "quiet", label: "Again", means: { does: "again" } }));
    add(bar, button("bar/hint", { look: "primary", label: "Hint", means: { does: "hint" } }));
    add(bar, badge("bar/moves", { text: String(a.moves), width: 0.42, at: { x: 0, y: 0 } }));
    add(desk, bar);

    // A READOUT — words and a count, no controls at all.
    const read = node("read", Container({ layout: "screens.row" }), Transformable({ at: { x: 0, y: -0.6 } }));
    add(read, label("read/score", { text: "Score", bounds: rect(0.7, 0.3) }));
    add(read, badge("read/value", { text: "1 280", look: "sunk", width: 0.7 }));
    add(read, label("read/left", { text: "Stock", bounds: rect(0.7, 0.3) }));
    add(read, badge("read/n", { text: "24", look: "quiet", width: 0.4 }));
    add(desk, read);

    // A PAUSE DIALOG — a panel with a heading, a segmented choice, a slider and two actions.
    const dialog = panel("pause", {
      bounds: rect(3.2, 2.2),
      title: PAUSED,
      layout: "screens.column",
      shadow: "silhouette",
      at: { x: 0, y: 0.75 },
    });
    add(dialog, toggles("pause/pace", {
      options: [
        { value: "slow", label: "Slow" },
        { value: "normal", label: "Normal" },
        { value: "fast", label: "Fast" },
      ],
      chosen: a.pace,
      layout: "screens.row",
    }));
    add(dialog, slider("pause/volume", { value: a.speed, width: 2.4 }));
    const actions = node("pause/actions", Container({ layout: "screens.row" }));
    add(actions, button("pause/resume", { label: "Resume", means: { does: "resume" } }));
    add(actions, button("pause/quit", { look: "danger", label: "Give up", means: { does: "quit" } }));
    add(dialog, actions);
    add(desk, dialog);

    add(desk, node("said", Bounded({ bounds: rect(4, 0.3) }), Labeled({ label: "press anything", style: CONTROL_LABEL }), Transformable({ at: { x: 0, y: 2.2 } })));

    const live = scene(desk, {
      press: (meaning, control) => {
        const said = byId(live.host.root, "said");
        if (!said) return;
        const what = Object.entries(meaning).map(([k, v]) => `${k}=${String(v)}`).join(" ");
        compose(said, Labeled({ label: `${control.id} · ${what}`, style: CONTROL_LABEL }));
        live.setRoot(live.host.root);
      },
    });
    return live.el;
  },
  args: { pace: "normal", speed: 0.6, moves: 7 },
  argTypes: {
    pace: documented("arg.picked", { control: "select", options: ["slow", "normal", "fast"] }, "state"),
    speed: documented("arg.level", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "state"),
    moves: documented("arg.count", { control: { type: "number", min: 0, step: 1 } }, "state"),
  },
  parameters: { gkDocStory: "hudScreens.screens" },
};
