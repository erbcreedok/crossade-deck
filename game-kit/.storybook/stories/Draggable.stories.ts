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
  cardW: number;
  cardH: number;
  face: string;
  faceRadius: number;
  cardX: number;
  cardY: number;
  onReject: "home" | "stay";
  stoneW: number;
  stoneH: number;
  stoneFill: string;
  stoneRadius: number;
  stoneX: number;
  stoneY: number;
  carry: string;
  lift: number;
  leanMaxDeg: number;
}

// The feel knobs are the engine's OWN fields (`MotionTuning.carry/lift/leanMaxDeg`), under their own
// names, handed to the wiring as they are; the whole record is on the `Engine/Motion` stand.
const onRejectControl = documented("arg.onReject", { control: "select", options: ["home", "stay"] }, "draggable");
const carryControl = documented("arg.carry", { control: "select", options: ["rigid", "loose"] }, "carry");
const liftControl = documented("arg.lift", { control: { type: "range", min: 1, max: 1.3, step: 0.02 } }, "carry");
const leanControl = documented("arg.leanMaxDeg", { control: { type: "range", min: 0, max: 25, step: 1 } }, "carry");
/** A box in units, a pose in units — the two shapes every node on this shelf is measured with. */
const sizeControl = (section: string, key: "arg.w" | "arg.h"): Record<string, unknown> =>
  documented(key, { control: { type: "number", min: 0, step: 0.1 } }, section);
const placeControl = (section: string, key: "arg.x" | "arg.y"): Record<string, unknown> =>
  documented(key, { control: { type: "range", min: -2, max: 2, step: 0.05 } }, section);

export const Drag: StoryObj<DragArgs> = {
  // ONE CARD YOU CAN PICK UP — and one stone you cannot: the pick asks `draggable`, and the stone
  // never had the atom. Drag the card and let go: nothing here accepts a drop, so every release is
  // a REFUSED one, and `onReject` is the whole verdict — `home` flies it back on the spring,
  // `stay` strands it where the finger left it. `lift` and `lean` are the carry's feel knobs.
  render: ({ id, cardW, cardH, face, faceRadius, cardX, cardY, onReject, stoneW, stoneH, stoneFill, stoneRadius, stoneX, stoneY, carry, lift, leanMaxDeg }) => {
    registerSurface("story.drag.face", { layers: [{ paint: face }], radius: faceRadius });
    registerSurface("story.drag.stone", { layers: [{ paint: stoneFill }], radius: stoneRadius });
    registerLayout("story.drag.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.drag.free" }));
    add(
      desk,
      node(
        id.trim() || "card",
        Bounded({ bounds: rect(cardW, cardH) }),
        Surfaced({ surface: "story.drag.face" }),
        Transformable({ at: { x: cardX, y: cardY } }),
        Draggable({ onReject }),
      ),
    );
    add(
      desk,
      node(
        "stone",
        Bounded({ bounds: rect(stoneW, stoneH) }),
        Surfaced({ surface: "story.drag.stone" }),
        Transformable({ at: { x: stoneX, y: stoneY } }),
      ),
    );
    return wireDrag(scene(desk, { animate: true }), { carry, lift, leanMaxDeg }).el;
  },
  args: {
    id: "card",
    cardW: 1,
    cardH: 1.4,
    face: "accent",
    faceRadius: 0.08,
    cardX: -1.2,
    cardY: 0,
    onReject: "home",
    stoneW: 0.9,
    stoneH: 0.9,
    stoneFill: "sunkBg",
    stoneRadius: 0.5,
    stoneX: 1.2,
    stoneY: 0.9,
    carry: DEFAULT_TUNING.carry,
    lift: DEFAULT_TUNING.lift,
    leanMaxDeg: DEFAULT_TUNING.leanMaxDeg,
  },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "card"),
    cardW: sizeControl("card/bounds", "arg.w"),
    cardH: sizeControl("card/bounds", "arg.h"),
    face: documented("arg.face", { control: "select", options: PAINTS }, "card/surface"),
    faceRadius: documented("arg.radius", { control: { type: "number", min: 0, step: 0.02 } }, "card/surface"),
    cardX: placeControl("card/transformable", "arg.x"),
    cardY: placeControl("card/transformable", "arg.y"),
    onReject: onRejectControl,
    stoneW: sizeControl("stone/bounds", "arg.w"),
    stoneH: sizeControl("stone/bounds", "arg.h"),
    stoneFill: documented("arg.fill", { control: "select", options: PAINTS }, "stone/surface"),
    stoneRadius: documented("arg.radius", { control: { type: "number", min: 0, step: 0.02 } }, "stone/surface"),
    stoneX: placeControl("stone/transformable", "arg.x"),
    stoneY: placeControl("stone/transformable", "arg.y"),
    carry: carryControl,
    lift: liftControl,
    leanMaxDeg: leanControl,
  },
  parameters: { gkDocStory: "draggable.drag" },
};

interface RunArgs {
  w: number;
  h: number;
  radius: number;
  fill0: string;
  fill1: string;
  fill2: string;
  fill3: string;
  x: number;
  y: number;
  stepY: number;
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
  render: ({ w, h, radius, fill0, fill1, fill2, fill3, x, y, stepY, onReject, carry, lift, leanMaxDeg }) => {
    registerLayout("story.drag.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.drag.free" }));
    for (const [i, paint] of [fill0, fill1, fill2, fill3].entries()) {
      registerSurface(`story.drag.run.${i}`, { layers: [{ paint }], radius });
      add(
        desk,
        node(
          `card#${i}`,
          Bounded({ bounds: rect(w, h) }),
          Surfaced({ surface: `story.drag.run.${i}` }),
          Transformable({ at: { x, y: y + i * stepY } }),
          Draggable({ onReject }),
        ),
      );
    }
    return wireDrag(scene(desk, { animate: true }), { carry, lift, leanMaxDeg, runOf: runBelow }).el;
  },
  args: {
    w: 1,
    h: 1.4,
    radius: 0.08,
    fill0: "accent",
    fill1: "alert",
    fill2: "textMuted",
    fill3: "panelBg",
    x: -0.9,
    y: -0.9,
    stepY: 0.55,
    onReject: "home",
    carry: DEFAULT_TUNING.carry,
    lift: DEFAULT_TUNING.lift,
    leanMaxDeg: DEFAULT_TUNING.leanMaxDeg,
  },
  argTypes: {
    w: sizeControl("cards/bounds", "arg.w"),
    h: sizeControl("cards/bounds", "arg.h"),
    radius: documented("arg.radius", { control: { type: "number", min: 0, step: 0.02 } }, "cards/surface"),
    fill0: documented("arg.fill", { control: "select", options: PAINTS }, "cards/surface"),
    fill1: documented("arg.fill", { control: "select", options: PAINTS }, "cards/surface"),
    fill2: documented("arg.fill", { control: "select", options: PAINTS }, "cards/surface"),
    fill3: documented("arg.fill", { control: "select", options: PAINTS }, "cards/surface"),
    x: placeControl("cards/transformable", "arg.x"),
    y: placeControl("cards/transformable", "arg.y"),
    stepY: documented("arg.stepY", { control: { type: "number", step: 0.05 } }, "cards/transformable"),
    onReject: onRejectControl,
    carry: carryControl,
    lift: liftControl,
    leanMaxDeg: leanControl,
  },
  parameters: { gkDocStory: "draggable.run" },
};
