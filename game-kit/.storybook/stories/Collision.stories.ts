import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { collisionMap, landingMap, roomOn } from "./collisionMap.js";
import { DIE_SCATTER } from "./gestureMap.js";
import { mergeRule, MERGE_REACH, MERGE_SHARE } from "./mergeMap.js";
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
  /** How much room a piece takes, as a factor of its own narrowest side — `1` is edge to edge. */
  room: number;
  /** What a die gives back off ANOTHER die, 0..1. */
  knock: number;
  /** How hard a handful pushes itself apart as it leaves the hand, units/s. */
  scatter: number;
  /** How far a gathered piece looks for its own kind when a handle is drawn, root units. */
  mergeReach: number;
  /** Off, and everything that gets in the way is shoved however gently it was let go. */
  holding: boolean;
}

/** Its own size, exactly: at `1` two pieces of a kind come to rest edge to edge. */
const ROOM = 1;

const COLLIDING = documented("arg.colliding", {}, "collision");
const ROOM_KNOB = documented(
  "arg.room",
  { control: { type: "number", min: 0, step: 0.1 }, if: { arg: "colliding" } },
  "collision",
);
const KNOCK = documented(
  "arg.knock",
  { control: { type: "number", min: 0, max: 1, step: 0.05 }, if: { arg: "colliding" } },
  "collision",
);
const HOLDING = documented("arg.holding", { if: { arg: "colliding" } }, "collision");
const REACH = documented("arg.mergeReach", { control: { type: "number", min: 0, step: 0.02 } }, "merge");
const SCATTER = documented(
  "arg.scatter",
  { control: { type: "number", min: 0, step: 0.2 }, if: { arg: "colliding" } },
  "collision",
);

/**
 * COLLISION — nothing on this desk ends up buried under something that had no business being there.
 *
 * Pick the handful of dice up by its handle and throw it. They leave the hand in a fan rather than
 * in a line, they knock each other aside on the way, and the one that stops first is still in the
 * way of the one still going — it gets shoved along rather than landed on. Every face stays
 * readable. Throw the chips into them and the chips knock them about too.
 *
 * BUT THE CARDS ARE A WORLD OF THEIR OWN. A card is solid to a card — deal them and no card buries
 * another — and thin air to everything else, because a card is a thing you put things ON. A card
 * that bounced off a die could never be dealt onto one, and a chip that could not be set down on a
 * card would make half the games anybody plays impossible. So "solid" is not one question, and the
 * desk answers it twice.
 *
 * Turn the switch off and the desk is the one from before the feature: throw the dice and they
 * arrive as one die with five shadows, which is the complaint this page is the answer to. Off is not
 * a second code path — it is the same throw with every piece saying it takes no room.
 */
export const Collision: StoryObj<CollisionArgs> = {
  render: ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, gripMiss, cardDrop, chipDrop, dieDrop, colliding, room, knock, scatter, mergeReach, holding }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax, miss: gripMiss },
      { card: cardDrop, chip: chipDrop, die: dieDrop },
      () => collisionMap(mergeReach),
      false,
      0,
      // The merging desk's rule, so a die heaps with a die: the handful is picked up as one, which
      // is the only way a page about a THROW can put six things in a hand at once.
      mergeRule(MERGE_SHARE),
      // NO ROOM FOR ANYBODY IS THE SWITCH. Off is not a second code path: it is the same throw with
      // every piece saying it takes no room, which is what every piece on every other desk says.
      // On THIS scene the holding is off: everything that reaches anything shoves it, however gently
      // it was let go. That a putting-down leaves the furniture alone is the next scene's subject.
      { roomFor: colliding ? roomOn(room) : () => undefined, bounce: knock, scatter, holds: holding },
    ),
  args: {
    ...STACK_ARGS,
    lifted: true,
    dropping: true,
    throwing: true,
    colliding: true,
    room: ROOM,
    knock: 0.7,
    scatter: DIE_SCATTER,
    mergeReach: MERGE_REACH,
    holding: false,
  },
  argTypes: { ...STACK_KNOBS, colliding: COLLIDING, room: ROOM_KNOB, knock: KNOCK, scatter: SCATTER, mergeReach: REACH, holding: HOLDING },
  parameters: { gkDocStory: "collision.scene" },
};

/**
 * LANDING — a thing put down beside another thing does not shove it aside.
 *
 * A block of chips lies on the felt and a handful of dice is held above it. Drop the dice — take
 * them by the handle, move nothing, let go — and they come down among the chips, finding room
 * between them, and NOT ONE CHIP MOVES. The block is still the block.
 *
 * Now turn the throw on and send the same handful into the same block. Every chip it reaches goes
 * skidding. Same pieces, same room, same worlds: what changed is that the hand was going somewhere.
 *
 * That is the whole of it — WHAT IS ALREADY LYING THERE HOLDS ITS PLACE UNLESS SOMETHING GENUINELY
 * TRAVELLING ARRIVES. It is still solid, so nothing comes to rest on top of it; it simply is not
 * pushed by a piece that only fell. Without the distinction a desk has to pick one wrong answer:
 * either a dropped die buries a chip, or setting a die down next to one flicks it across the felt.
 *
 * The threshold is the desk's own (`THROWN_AT`) — the same speed that decides whether a released
 * piece flies at all, so "thrown" means one thing here and not two.
 */
export const Landing: StoryObj<CollisionArgs> = {
  render: ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, gripMiss, cardDrop, chipDrop, dieDrop, colliding, room, knock, scatter, holding, mergeReach }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax, miss: gripMiss },
      { card: cardDrop, chip: chipDrop, die: dieDrop },
      () => landingMap(mergeReach),
      false,
      0,
      mergeRule(MERGE_SHARE),
      { roomFor: colliding ? roomOn(room) : () => undefined, bounce: knock, scatter, holds: holding },
    ),
  // THE THROW IS OFF and the holding is ON — that pair is the scene. Turn the holding off and it is
  // the scene above: everything that reaches anything shoves it, however gently it was let go. Turn
  // the throw on and you get the other half of the lesson on the same felt.
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, colliding: true, room: 1, knock: 0.7, scatter: DIE_SCATTER, mergeReach: MERGE_REACH, holding: true },
  argTypes: { ...STACK_KNOBS, colliding: COLLIDING, room: ROOM_KNOB, knock: KNOCK, scatter: SCATTER, mergeReach: REACH, holding: HOLDING },
  parameters: { gkDocStory: "collision.landing" },
};
