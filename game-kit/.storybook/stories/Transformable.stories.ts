import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Container, node, rect, Surfaced, Transformable } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import {
  cardPoseOf,
  documented,
  handPoseOf,
  POSE_ARGS,
  poseArgsAt,
  poseArgTypes,
  poseOf,
  type PoseArgs,
} from "./surfaceControls.js";

// THE ATOM HAS FOUR FIELDS AND THREE INHERITANCE CLASSES, and that is what this section is
// arranged around: each stand is one field's own lesson, plus one stand for the whole pose at
// once. Every control on every stand is a REAL field of `Transformable` on a REAL node — the
// panel's categories say whose pose a row belongs to, and there is no assembled knob that maps
// to nothing.
//
//   `at`    is own        — `Pose` moves one card; `Placed` shows the layout writing it instead.
//   `z`     adds up       — `Lifted` covers one plate with another and uncovers it at −1.
//   `angle` adds up       — `Turned` turns a hand and the cards turn with it.
//   `scale` multiplies    — `Sized` puts a half inside a half and reads a quarter.
//
// The box is the same on every stand — 1.2×0.8, two DIFFERENT sides — so a turn is visible on
// it and a transposed axis would be too.

const meta: Meta = {
  title: "Atoms/Transformable",
  parameters: {
    gkDoc: "transformable.component",
    // What this section claims to cover, checked against the atom itself by
    // `guard.every-field-has-a-control`: the day a fifth field is declared, the guard fails
    // here rather than the gap being noticed months later by a reader.
    gkAtom: "Transformable",
    gkFields: { at: ["x", "y"], z: ["z"], angle: ["angle"], scale: ["scale"] },
  },
};
export default meta;

// ---- Pose: the whole atom on one node -------------------------------------------------------

interface PoseStoryArgs extends PoseArgs {
  id: string;
}

export const Pose: StoryObj<PoseStoryArgs> = {
  // ONE CARD WEARING THE WHOLE ATOM, over a mark that never moves. The mark is the same box
  // under the stock `zone` record, sitting where the card would be with no pose at all — so
  // every control reads as a DIFFERENCE from it.
  //
  // The order inside the pose is fixed: scale, then turn, then move. Set `scale: 2` with an
  // offset and the card is twice as big, not twice as far — the mark is what makes that
  // checkable by eye.
  render: (a) => {
    const desk = node("desk", Container({ layout: "free" }));
    add(desk, node("mark", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced({ surface: "zone" })));
    add(desk, node(a.id.trim() || "card", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced(), Transformable(poseOf(a))));
    return scene(desk).el;
  },
  args: { id: "card", ...POSE_ARGS, x: 0.4, y: 0.25, angle: 15 },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    ...poseArgTypes(),
  },
  parameters: { gkDocStory: "transformable.pose" },
};

// ---- Lifted: z decides who is on top --------------------------------------------------------

export const Lifted: StoryObj<PoseArgs> = {
  // Two overlapping plates. Take `z` to −1 and the same plate goes UNDER: the pose moved it,
  // the height decided which one you see. At `z: 0` the two are equal and tree order stands —
  // the later sibling paints on top.
  render: (a) => {
    const desk = node("desk", Container({ layout: "free" }));
    add(desk, node("under", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced(), Transformable({ at: { x: -0.2, y: -0.2 } })));
    add(desk, node("over", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced({ surface: "bare" }), Transformable(poseOf(a))));
    return scene(desk).el;
  },
  args: { ...POSE_ARGS, x: 0.2, y: 0.2, z: 1 },
  argTypes: poseArgTypes(),
  parameters: { gkDocStory: "transformable.lifted" },
};

// ---- Turned: angle adds up along the chain --------------------------------------------------

/** Two whole poses, flat — the panel's names for a chain of a hand and a card. */
interface ChainArgs {
  handX: number;
  handY: number;
  handZ: number;
  handAngle: number;
  handScale: number;
  cardX: number;
  cardY: number;
  cardZ: number;
  cardAngle: number;
  cardScale: number;
}

export const Turned: StoryObj<ChainArgs> = {
  // A HAND HOLDING TWO CARDS, and both poses whole. Turn the hand and everything in it turns
  // with it — the silent card said nothing about angle and turns anyway, because `angle` adds
  // up and a child cannot un-turn its owner. The other card adds its own fifteen on top: what
  // it shows is the SUM, never a replacement.
  render: (a) => {
    const desk = node("desk", Container({ layout: "free" }));
    const hand = node("hand", Container({ layout: "free" }), Transformable(handPoseOf(a)));
    add(hand, node("silent", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced(), Transformable({ at: { x: -0.5, y: 0 } })));
    add(hand, node("turned", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced({ surface: "bare" }), Transformable(cardPoseOf(a))));
    add(desk, hand);
    return scene(desk).el;
  },
  args: { ...poseArgsAt("hand", { angle: 30 }), ...poseArgsAt("card", { x: 0.5, angle: 15 }) },
  argTypes: {
    ...poseArgTypes("hand transformable", "hand"),
    ...poseArgTypes("card transformable", "card"),
  },
  parameters: { gkDocStory: "transformable.turned" },
};

// ---- Sized: scale multiplies along the chain ------------------------------------------------

export const Sized: StoryObj<ChainArgs> = {
  // THE ONE FIELD THAT MULTIPLIES. The etalon on the left never scales; the hand on the right
  // holds a card, and both carry their own `scale`. At 0.5 × 0.5 the card shows at a QUARTER of
  // the etalon — no sum says that, which is why `multiplies` is a class of its own. Take either
  // scale to zero and the picture honestly vanishes: nothing has a size.
  render: (a) => {
    const desk = node("desk", Container({ layout: "free" }));
    add(desk, node("etalon", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced(), Transformable({ at: { x: -0.9, y: 0 } })));
    const hand = node("hand", Container({ layout: "free" }), Transformable(handPoseOf(a)));
    add(hand, node("card", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced({ surface: "bare" }), Transformable(cardPoseOf(a))));
    add(desk, hand);
    return scene(desk).el;
  },
  args: { ...poseArgsAt("hand", { x: 0.6, scale: 0.5 }), ...poseArgsAt("card", { scale: 0.5 }) },
  argTypes: {
    ...poseArgTypes("hand transformable", "hand"),
    ...poseArgTypes("card transformable", "card"),
  },
  parameters: { gkDocStory: "transformable.sized" },
};

// ---- Placed: a layout writes `at` -----------------------------------------------------------

interface PlacedArgs extends Omit<ChainArgs, "handX" | "handY" | "handZ" | "handAngle" | "handScale"> {
  layout: "free" | "row";
}

export const Placed: StoryObj<PlacedArgs> = {
  // THE OTHER HALF OF `at` BEING OWN: inside a container it is the LAYOUT that resolves it.
  // Under `free` the card sits exactly where its `at` says; switch to `row` and the layout
  // writes `at` for every child — the position controls visibly stop mattering, and that is
  // the lesson, not a broken panel. The card's `z`, `angle` and `scale` keep working either
  // way: a layout writes positions and NOTHING else.
  render: (a) => {
    const desk = node("desk", Container({ layout: a.layout }));
    add(desk, node("anchor", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced(), Transformable({ at: { x: -0.7, y: -0.4 } })));
    add(desk, node("card", Bounded({ bounds: rect(1.2, 0.8) }), Surfaced({ surface: "bare" }), Transformable(cardPoseOf(a))));
    return scene(desk).el;
  },
  args: { layout: "free", ...poseArgsAt("card", { x: 0.6, y: 0.3 }) },
  argTypes: {
    layout: documented("arg.layout", { control: "inline-radio", options: ["free", "row"] }, "container"),
    ...poseArgTypes("card transformable", "card"),
  },
  parameters: { gkDocStory: "transformable.placed" },
};
