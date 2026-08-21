import type { Meta, StoryObj } from "@storybook/html";
import {
  activate,
  add,
  Bounded,
  button,
  Container,
  CONTROL_LABEL,
  freeLayout,
  installStockControls,
  Labeled,
  node,
  rect,
  registerLayout,
  Transformable,
  type Node,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// ACTIONABLE is the atom a CONTROL carries: it names the intent a press emits. The name is a
// registry ref and never a callback, because a node travels — into a snapshot, over a wire, into a
// second screen's projection — and a function survives none of those trips.
//
// The page shows the one law that has no field: THERE IS NO `disabled`. Both buttons here are
// assembled by the same `button()` call and are the same control in every respect but one — the
// upper carries an `action`, the lower does not. Clear the upper one's `action` and it stops
// emitting too. The refusal is the absence, and there is no flag that could disagree with it.
installStockControls();

interface IntentArgs {
  action: string;
  label: string;
  mute: string;
  gap: number;
}

const meta: Meta = {
  title: "Atoms/Actionable",
  parameters: {
    gkDoc: "actionable.component",
    gkAtom: "Actionable",
    // One field, and the page that drives it. `action` is a ref: type a verb nobody registered and
    // it still comes out — the control does not police the registry, consumers own their own verbs.
    gkFields: { action: ["Intent"] },
  },
};
export default meta;

/**
 * What `activate` answered, drawn as words — the story reads the same function a handler would.
 *
 * Both readouts wear the stock control role and sit in the same box, so the two lines read as one
 * kind of thing. Without a role the shorter answer is drawn far larger than the longer one — the
 * caption fits itself to the box it is given, honestly, and here that honesty would say "these are
 * two different labels" when the whole point is that they are the same one answering differently.
 */
const readout = (id: string, of: Node, y: number): Node =>
  node(
    id,
    Bounded({ bounds: rect(3.4, 0.4) }),
    Transformable({ at: { x: 0, y } }),
    Labeled({ label: activate(of) ?? "activate() → nothing fires", style: CONTROL_LABEL }),
  );

export const Intent: StoryObj<IntentArgs> = {
  // TWO CONTROLS, ONE DIFFERENCE. Same preset, same look, same caption role; the upper names a verb
  // and the lower names none. Under each is what `activate()` actually returned — the very call a
  // press handler makes before it decides whether anything happened at all.
  render: ({ action, label, mute, gap }) => {
    registerLayout("story.actionable.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.actionable.free" }));

    const speaks = button("speaks", { label, action, at: { x: 0, y: -gap } });
    const silent = button("silent", { label: mute, at: { x: 0, y: gap } });

    add(desk, speaks);
    add(desk, readout("speaksSays", speaks, -gap + 0.62));
    add(desk, silent);
    add(desk, readout("silentSays", silent, gap + 0.62));
    return scene(desk).el;
  },
  args: { action: "flip", label: "Flip", mute: "Flip", gap: 0.75 },
  argTypes: {
    action: documented("arg.action", { control: "text" }, "speaks/actionable"),
    label: documented("arg.label", { control: "text" }, "speaks/labeled"),
    mute: documented("arg.label", { control: "text" }, "silent/labeled"),
    gap: documented("arg.gap", { control: { type: "number", min: 0, step: 0.05 } }, "desk/spacing"),
  },
  parameters: { gkDocStory: "actionable.intent" },
};
