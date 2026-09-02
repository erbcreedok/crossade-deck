import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { grabScene } from "./gestureScene.js";
import { FLIPPING, SHOWS, SHOWS_DEFAULT, STACK_ARGS, STACK_KNOBS, type FlipArgs } from "./gestureKnobs.js";
import { mergeMap, mergeRule, MERGE_REACH, MERGE_SHARE } from "./mergeMap.js";
import { documented } from "./surfaceControls.js";

// MECHANICS — the rules a desk plays by, as opposed to the gestures a hand makes on it.
//
// The gesture shelf answers "what does the kit do when a finger does this". This one answers "what
// does a DESK do", and the two are not the same shelf because they are not the same author: a
// gesture is the kit's, a rule about which pieces belong together is the game's. Everything here is
// written in the catalog, on top of the same kit, with no privilege the kit does not offer.

installStockCarries();
installStockFlips();

const meta: Meta = {
  title: "Mechanics/Stack merging",
  parameters: { gkDoc: "merging.component" },
};
export default meta;

interface MergeArgs extends FlipArgs {
  /** How much of a piece must lie under another before the two are one pile, 0..1. */
  mergeShare: number;
  /** How far a GATHERED piece looks for its own kind, root units — a card looks nowhere. */
  mergeReach: number;
}

/**
 * ITS OWN NUMBER, and deliberately not the tap ladder's.
 *
 * The two thresholds are measured the same way, on the same sampled overlap, and a reader who has
 * met one has met the other. They are still two: `showsEnough` asks how much of a card is VISIBLE
 * before it will take a finger, and this asks how much of it is COVERED before it is part of the
 * pile. Fused into one number they would pull against each other — a pile packed tightly enough to
 * hide its lower cards is one no card could ever be added to.
 */
/**
 * ITS OWN NUMBER, in units and not a share, because it answers a different question: the share asks
 * how much of a piece is COVERED, and this asks how far away another one still counts as NEXT TO it.
 * Turn it to zero and every pile on the desk becomes a card's kind of pile — things have to be on
 * each other — which is the honest way to see what the reach buys.
 */
const REACH = documented("arg.mergeReach", { control: { type: "number", min: 0, step: 0.02 } }, "merge");

const SHARE = documented("arg.mergeShare", { control: { type: "number", min: 0, max: 1, step: 0.05 } }, "merge");

/**
 * STACK MERGING — the same finger and the same handles, and a heap that has an OPINION about what
 * goes in it.
 *
 * The desk has a closed deck, one card face up beside it, ten chips each of three denominations and
 * two dice, and it starts with nothing touching anything. Push things together and watch what grows
 * a handle:
 *
 *   A CARD ONLY EVER JOINS A CARD, a chip only a chip of its OWN denomination, a die only a die. A
 *   red five laid across a green twenty-five is two piles lying on each other, and the desk says so
 *   by growing two handles.
 *
 *   AND ONLY IF THEY REALLY MEET. The share on the panel is the whole of the complaint this page was
 *   built for: deal a hand, and a card that skids to a stop with one corner over two different deals
 *   used to join both of them — legally, by the only rule the older desks had. Turn the number down
 *   to nothing and that desk is back, which is the honest way to show what the rule bought.
 *
 *   AND ONLY IF THEY AGREE WHICH WAY UP THEY ARE LYING — unless the one that disagrees is the one
 *   you just put there. A face-down deck dropped onto face-up cards does not swallow them; a
 *   face-up card dropped onto a face-down pile joins it. Same two facings, same overlap, and what
 *   tells them apart is which arrived last — which the desk already knows, because the last thing
 *   put down is the thing drawn on top. See `admits` in `mergeMap.ts`.
 *
 * Everything the gesture shelf taught is still here and still switchable: the pop, the fall, the
 * throw, the handles, the tap that turns a card over. This page adds one number.
 */
export const StackMerging: StoryObj<MergeArgs> = {
  render: ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, gripMiss, cardDrop, chipDrop, dieDrop, flipping, showsEnough, mergeShare, mergeReach }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax, miss: gripMiss },
      { card: cardDrop, chip: chipDrop, die: dieDrop },
      () => mergeMap(mergeReach),
      flipping,
      showsEnough,
      // OFF IS THE PAGE BEFORE THIS ONE, like every other switch on the shelf: a share of zero is
      // the old rule exactly — anything of the same kind that touches at all is one heap — so the
      // reader can put the bug back and watch it happen.
      mergeRule(mergeShare),
    ),
  args: {
    ...STACK_ARGS,
    lifted: true,
    dropping: true,
    throwing: true,
    flipping: true,
    showsEnough: SHOWS_DEFAULT,
    mergeShare: MERGE_SHARE,
    mergeReach: MERGE_REACH,
  },
  argTypes: { ...STACK_KNOBS, flipping: FLIPPING, showsEnough: SHOWS, mergeShare: SHARE, mergeReach: REACH },
  parameters: { gkDocStory: "merging.scene" },
};
