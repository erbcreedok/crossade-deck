import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, cascade, Container, fan, node, rect, stack, Surfaced, Transformable } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// PRESETS THAT GENERATE A POSE — one page per dealer, and nothing else on it.
//
// Every one of these is an ORDINARY FUNCTION the kit exports, returning one pose per child for
// `Transformable` to wear — the same relation `star(...)` has to `Bounded`. They used to not
// exist at all, and every fan in a demo was a loop somebody wrote by hand, slightly differently
// each time.
//
// What is NOT here: `z`. A dealt pose is a position and a turn, held to that by its TYPE — the
// same law layouts obey. Siblings keep tree order at equal height, so the card dealt last
// already shows on top, and thickness is an `at` offset (`Atoms/Transformable` teaches why).
//
// Each stand shows only its own dealer's parameters, exactly as `Presets/Bounds` does: a story
// that can turn into a different story is not honest about what it draws.

interface DealArgs {
  count: number;
  spread: number;
  radius: number;
  driftX: number;
  driftY: number;
  stepX: number;
  stepY: number;
}

const meta: Meta<DealArgs> = {
  title: "Presets/Poses",
  parameters: { gkDoc: "presetsPoses.component" },
  args: { count: 5, spread: 60, radius: 2, driftX: 0.03, driftY: -0.03, stepX: 0, stepY: 0.35 },
  argTypes: {
    count: documented("arg.count", { control: { type: "range", min: 0, max: 12, step: 1 } }, "deal"),
    spread: documented("arg.spread", { control: { type: "number", step: 5 } }, "fan"),
    radius: documented("arg.wrist", { control: { type: "number", min: 0.1, step: 0.1 } }, "fan"),
    driftX: documented("arg.driftX", { control: { type: "number", step: 0.01 } }, "stack"),
    driftY: documented("arg.driftY", { control: { type: "number", step: 0.01 } }, "stack"),
    stepX: documented("arg.stepX", { control: { type: "number", step: 0.05 } }, "cascade"),
    stepY: documented("arg.stepY", { control: { type: "number", step: 0.05 } }, "cascade"),
  },
};
export default meta;

export const Fan: StoryObj<DealArgs> = {
  // A hand fan: the middle card rests where a single card would, the ends swing down and out
  // about a wrist below the picture. `spread` is the WHOLE arc, first card to last — take the
  // count up and the cards pack tighter, not wider.
  render: (a) => {
    const hand = node("hand", Container({ layout: "free" }));
    fan(a.count, { spread: a.spread, radius: a.radius }).forEach((pose, i) => {
      add(hand, node(`card${i}`, Bounded({ bounds: rect(1, 1.4) }), Surfaced(), Transformable(pose)));
    });
    return scene(hand).el;
  },
  parameters: { gkDocStory: "presetsPoses.fan", controls: { include: ["count", "spread", "radius"] } },
};

export const Stack: StoryObj<DealArgs> = {
  // A resting stack: thickness as an `at` drift, not a step of `z`. The card dealt last shows
  // on top because tree order says so — nothing here is lifted, and lifting the whole pile is
  // its container's `z`, applied once.
  render: (a) => {
    const pile = node("pile", Container({ layout: "free" }));
    stack(a.count, { drift: { x: a.driftX, y: a.driftY } }).forEach((pose, i) => {
      add(pile, node(`card${i}`, Bounded({ bounds: rect(1, 1.4) }), Surfaced(), Transformable(pose)));
    });
    return scene(pile).el;
  },
  parameters: { gkDocStory: "presetsPoses.stack", controls: { include: ["count", "driftX", "driftY"] } },
};

export const Cascade: StoryObj<DealArgs> = {
  // The same march as a stack, spaced to be READ: each card steps far enough that the one under
  // it still shows its top. A solitaire column is this straight down; a dealt river is the same
  // call with the step turned sideways.
  render: (a) => {
    const column = node("column", Container({ layout: "free" }));
    cascade(a.count, { step: { x: a.stepX, y: a.stepY } }).forEach((pose, i) => {
      add(column, node(`card${i}`, Bounded({ bounds: rect(1, 1.4) }), Surfaced(), Transformable(pose)));
    });
    return scene(column).el;
  },
  parameters: { gkDocStory: "presetsPoses.cascade", controls: { include: ["count", "stepX", "stepY"] } },
};
