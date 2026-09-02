import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { collisionMap } from "./collisionMap.js";
import { DIE_SCATTER } from "./gestureMap.js";
import { mergeRule, MERGE_SHARE } from "./mergeMap.js";
import { grabScene } from "./gestureScene.js";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";

installStockCarries();
installStockFlips();

const meta: Meta = {
  title: "Mechanics/Collision",
  parameters: { gkDoc: "collision.component" },
};
export default meta;

interface CollisionArgs extends StackArgs {
  /** Off, and nothing takes up any room: the desk before this page, where dice land on dice. */
  colliding: boolean;
  /** How much room a die takes from another die, root units — a radius, so two are apart at twice it. */
  girth: number;
  /** What a die gives back off ANOTHER die, 0..1. */
  knock: number;
  /** How hard a handful pushes itself apart as it leaves the hand, units/s. */
  scatter: number;
}

/** Half a die's own side — a disc through the flat of its faces, where two dice really stop each other. */
const GIRTH = 0.45;

const COLLIDING = documented("arg.colliding", {}, "collision");
const GIRTH_KNOB = documented(
  "arg.girth",
  { control: { type: "number", min: 0, step: 0.05 }, if: { arg: "colliding" } },
  "collision",
);
const KNOCK = documented(
  "arg.knock",
  { control: { type: "number", min: 0, max: 1, step: 0.05 }, if: { arg: "colliding" } },
  "collision",
);
const SCATTER = documented(
  "arg.scatter",
  { control: { type: "number", min: 0, step: 0.2 }, if: { arg: "colliding" } },
  "collision",
);

/**
 * COLLISION — six dice, and no two of them will end up on the same square inch of felt.
 *
 * Pick the lot up by the handle and throw them. They leave the hand in a fan rather than in a line,
 * they knock each other aside on the way, and the one that stops first is still in the way of the
 * one still going — it gets shoved along rather than landed on. Throw them into a corner and they
 * pile up against the border and against each other, and every face stays readable.
 *
 * The chips and the cards on the same desk are the control. They take no room at all and never have,
 * so they land on each other exactly as they do everywhere else on the shelf: a chip stack is a
 * stack because a chip is MEANT to be covered. Collision is a thing a piece says about itself, not
 * a rule the desk imposes on everything standing on it.
 *
 * Turn the switch off and the desk is the one from before the feature: throw the dice and they
 * arrive as one die with five shadows, which is the complaint this page is the answer to.
 */
export const Collision: StoryObj<CollisionArgs> = {
  render: ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, cardDrop, chipDrop, dieDrop, colliding, girth, knock, scatter }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax },
      { card: cardDrop, chip: chipDrop, die: dieDrop },
      collisionMap,
      false,
      0,
      // The merging desk's rule, so a die heaps with a die: the handful is picked up as one, which
      // is the only way a page about a THROW can put six things in a hand at once.
      mergeRule(MERGE_SHARE),
      // A GIRTH OF NOTHING IS THE SWITCH. Off is not a second code path: it is the same throw with
      // every piece saying it takes no room, which is what every piece on every other desk says.
      { girth: colliding ? girth : 0, bounce: knock, scatter: colliding ? scatter : 0 },
    ),
  args: {
    ...STACK_ARGS,
    lifted: true,
    dropping: true,
    throwing: true,
    colliding: true,
    girth: GIRTH,
    knock: 0.7,
    scatter: DIE_SCATTER,
  },
  argTypes: { ...STACK_KNOBS, colliding: COLLIDING, girth: GIRTH_KNOB, knock: KNOCK, scatter: SCATTER },
  parameters: { gkDocStory: "collision.scene" },
};
