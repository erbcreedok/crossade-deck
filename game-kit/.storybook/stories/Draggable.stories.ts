import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  DEFAULT_TUNING,
  Draggable,
  freeLayout,
  installStockCarries,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { runBelow, wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// DRAGGABLE says one thing as data: this element can be picked up — and where it goes when a drop
// is REFUSED (`onReject`: fly home, or stay stranded). Everything else about a drag is runtime: the
// pointer wiring is the game's own (pointerdown picks off the plan and hands the run to the clock,
// pointermove retargets the chase spring, pointerup decides), and the FEEL — the lag behind the
// finger, the lift pop, the lean into motion — is the motion runtime's spring carry. These scenes
// wire exactly that, so the atom can be felt, not only read: drag the card with your own pointer.
//
// The carry styles are installed here, as an ordinary consumer would install them.
installStockCarries();

const meta: Meta = {
  title: "Atoms/Draggable",
  parameters: {
    gkDoc: "draggable.component",
    gkAtom: "Draggable",
    // The atom's one field and the controls that reach it — both scenes let a refused drop play
    // out either way.
    gkFields: { onReject: ["Drag", "Run"] },
  },
};
export default meta;

interface DragArgs {
  id: string;
  face: string;
  onReject: "home" | "stay";
  carry: string;
  lift: number;
  leanMaxDeg: number;
}

// The feel knobs are the engine's OWN fields (`MotionTuning.carry/lift/leanMaxDeg`), under their own
// names, handed to the wiring as they are; the whole record is on the `Engine/Motion` stand.
const onRejectControl = documented("arg.onReject", { control: "select", options: ["home", "stay"] }, "drag");
const carryControl = documented("arg.carry", { control: "select", options: ["rigid", "loose"] }, "drag/feel");
const liftControl = documented("arg.lift", { control: { type: "range", min: 1, max: 1.3, step: 0.02 } }, "drag/feel");
const leanControl = documented("arg.leanMaxDeg", { control: { type: "range", min: 0, max: 25, step: 1 } }, "drag/feel");

export const Drag: StoryObj<DragArgs> = {
  // ONE CARD YOU CAN PICK UP — and one stone you cannot: the pick asks `draggable`, and the stone
  // never had the atom. Drag the card and let go: nothing here accepts a drop, so every release is
  // a REFUSED one, and `onReject` is the whole verdict — `home` flies it back on the spring,
  // `stay` strands it where the finger left it. `lift` and `lean` are the carry's feel knobs.
  render: (a) => {
    registerSurface("story.drag.face", { layers: [{ paint: a.face }], radius: 0.08 });
    registerSurface("story.drag.stone", { layers: [{ paint: "sunkBg" }], radius: 0.5 });
    registerLayout("story.drag.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.drag.free" }));
    add(
      desk,
      node(
        a.id.trim() || "card",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.drag.face" }),
        Transformable({ at: { x: -1.2, y: 0 } }),
        Draggable({ onReject: a.onReject }),
      ),
    );
    add(
      desk,
      node(
        "stone",
        Bounded({ bounds: rect(0.9, 0.9) }),
        Surfaced({ surface: "story.drag.stone" }),
        Transformable({ at: { x: 1.2, y: 0.9 } }),
      ),
    );
    return wireDrag(scene(desk, { animate: true }), { carry: a.carry, lift: a.lift, leanMaxDeg: a.leanMaxDeg }).el;
  },
  args: { id: "card", face: "accent", onReject: "home", carry: DEFAULT_TUNING.carry, lift: DEFAULT_TUNING.lift, leanMaxDeg: DEFAULT_TUNING.leanMaxDeg },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    face: documented("arg.face", { control: "select", options: PAINTS }, "surface"),
    onReject: onRejectControl,
    carry: carryControl,
    lift: liftControl,
    leanMaxDeg: leanControl,
  },
  parameters: { gkDocStory: "draggable.drag" },
};

interface RunArgs {
  onReject: "home" | "stay";
  carry: string;
  lift: number;
  leanMaxDeg: number;
}

export const Run: StoryObj<RunArgs> = {
  // A COLUMN THAT TRAVELS AS A RUN: grab any card and it leads every card below it — the same
  // one-plank carry a solitaire column rides. `carry` is the split the styles exist for: `rigid`
  // co-rotates the whole run about the grab, a coherent body; `loose` turns each card in place,
  // the venetian-blind look a horizontal hand wants. At zero lean the two are the same picture.
  render: (a) => {
    registerLayout("story.drag.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.drag.free" }));
    for (const [i, paint] of (["accent", "alert", "textMuted", "panelBg"] as const).entries()) {
      registerSurface(`story.drag.run.${paint}`, { layers: [{ paint }], radius: 0.08 });
      add(
        desk,
        node(
          `card#${i}`,
          Bounded({ bounds: rect(1, 1.4) }),
          Surfaced({ surface: `story.drag.run.${paint}` }),
          Transformable({ at: { x: -0.9, y: -0.9 + i * 0.55 } }),
          Draggable({ onReject: a.onReject }),
        ),
      );
    }
    return wireDrag(scene(desk, { animate: true }), { carry: a.carry, lift: a.lift, leanMaxDeg: a.leanMaxDeg, runOf: runBelow }).el;
  },
  args: { onReject: "home", carry: DEFAULT_TUNING.carry, lift: DEFAULT_TUNING.lift, leanMaxDeg: DEFAULT_TUNING.leanMaxDeg },
  argTypes: {
    onReject: onRejectControl,
    carry: carryControl,
    lift: liftControl,
    leanMaxDeg: leanControl,
  },
  parameters: { gkDocStory: "draggable.run" },
};
