import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { landingMap, roomOn } from "./collisionMap.js";
import { DIE_SCATTER } from "./gestureMap.js";
import { grabScene } from "./gestureScene.js";
import { mergeRule, MERGE_SHARE } from "./mergeMap.js";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";

installStockCarries();
installStockFlips();

const meta: Meta = {
  title: "Mechanics/Landing",
  parameters: { gkDoc: "landing.component" },
};
export default meta;

interface LandingArgs extends StackArgs {
  /** Off, and nothing takes up any room: the desk before the feature, where dice land on chips. */
  colliding: boolean;
  /** How much room a piece takes, as a factor of its own narrowest side — `1` is edge to edge. */
  room: number;
  /** What a piece gives back off another piece of its own world, 0..1. */
  knock: number;
  /** How hard a handful pushes itself apart as it leaves the hand, units/s. */
  scatter: number;
}

const COLLIDING = documented("arg.colliding", {}, "collision");
const ROOM_KNOB = documented("arg.room", { control: { type: "number", min: 0, step: 0.1 }, if: { arg: "colliding" } }, "collision");
const KNOCK = documented("arg.knock", { control: { type: "number", min: 0, max: 1, step: 0.05 }, if: { arg: "colliding" } }, "collision");
const SCATTER = documented("arg.scatter", { control: { type: "number", min: 0, step: 0.2 }, if: { arg: "colliding" } }, "collision");

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
export const Landing: StoryObj<LandingArgs> = {
  render: ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, cardDrop, chipDrop, dieDrop, colliding, room, knock, scatter }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax },
      { card: cardDrop, chip: chipDrop, die: dieDrop },
      landingMap,
      false,
      0,
      mergeRule(MERGE_SHARE),
      { roomFor: colliding ? roomOn(room) : () => undefined, bounce: knock, scatter },
    ),
  // THE THROW IS OFF, and that is the page: its neighbour `Collision` is the same desk with the same
  // pieces thrown, and the pair is the lesson. Turn it on here and this page becomes that one.
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, colliding: true, room: 1, knock: 0.7, scatter: DIE_SCATTER },
  argTypes: { ...STACK_KNOBS, colliding: COLLIDING, room: ROOM_KNOB, knock: KNOCK, scatter: SCATTER },
  parameters: { gkDocStory: "landing.scene" },
};
