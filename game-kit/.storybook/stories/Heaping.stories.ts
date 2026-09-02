import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  installStockCarries,
  node,
  rect,
  Surfaced,
  type Node,
} from "../../src/index.js";
import { grabScene } from "./gestureScene.js";
import { installMergeArt, mergeChip, mergeRule, MERGE_REACH, MERGE_SHARE, CHIP_VALUES } from "./mergeMap.js";
import { MAP } from "./gestureMap.js";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";

// HEAPING is the answer to "may these two become one thing", carried by the piece instead of worked
// out about it. Two pieces heap when they name the same pile and never otherwise; what a name MEANS
// is the game's business, and the kit never looks inside one.
//
// The page is a pair of pairs. On the left two chips of one denomination, which say the same name
// and so grow a handle between them. On the right two chips of DIFFERENT denominations, which do
// not — until the panel makes the second one claim the first one's pile, and then they do. That is
// the whole atom: nothing about the chips changed, and what changed is what they call themselves.
//
// A chip's denomination is IN its name (`chip:25` and `chip:100` are two piles). A card's FACE is
// not, deliberately: which faces may lie together is a rule about the moment a piece arrived, not
// about the piece, and a rule about a moment cannot live on a node. See `Mechanics/Stack merging`.

installStockCarries();

const meta: Meta = {
  title: "Atoms/Heaping",
  parameters: {
    gkDoc: "heaping.component",
    gkAtom: "Heaping",
    gkFields: { heap: ["heap"] },
  },
};
export default meta;

const SMALL = CHIP_VALUES[0]!;
const MIDDLE = CHIP_VALUES[1]!;

/** The pile the odd chip claims: its own, or the one its neighbour belongs to. */
const NAMES = [`chip:${MIDDLE}`, `chip:${SMALL}`] as const;

interface HeapingArgs extends StackArgs {
  heap: string;
  reach: number;
}

const HEAP = documented("arg.heap", { control: "select", options: NAMES }, "heaping");
/**
 * HOW FAR OUT A PIECE LOOKS FOR ITS OWN KIND — `Reaching`'s field, on this page because the two
 * atoms only mean anything together: a name says WHOM a piece may join and a reach says how CLOSE
 * that has to be, and neither alone makes a pile. At nothing a piece must be COVERED to belong,
 * which is what a card means by a pile; above nothing it takes anything of its pile inside that
 * neighbourhood, which is what a chip means by one. The atom's own page is `Mechanics/Magnetism`,
 * where a ZONE reaches — the case that shows the reach is nothing to do with piles.
 */
const REACH = documented("arg.reach", { control: { type: "number", min: 0, step: 0.02 } }, "heaping");

/** Two pairs on a bare desk: one that agrees about its pile, one whose second chip is the argument. */
const twoPairs = (heap: string, reach: number) => (): Node => {
  installMergeArt();
  const desk = node(
    "map",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: "merge.free" }),
    Surfaced({ surface: "gesture.map" }),
  );
  // Overlapping by about a third, so both pairs are well past the share a heap needs and the only
  // thing that can be deciding the answer is the name.
  add(desk, mergeChip("agreed left", SMALL, { x: -1.3, y: -0.2 }, undefined, reach));
  add(desk, mergeChip("agreed right", SMALL, { x: -0.95, y: -0.2 }, undefined, reach));
  add(desk, mergeChip("odd one out", MIDDLE, { x: 0.95, y: -0.2 }, undefined, reach));
  add(desk, mergeChip("the claimant", SMALL, { x: 1.3, y: -0.2 }, heap, reach));
  return desk;
};

/**
 * The left pair has a handle and the right pair has none — and then the panel gives the right-hand
 * chip the left pile's name, and a handle grows under it too. Pull either and it comes up as a stack.
 */
export const Heap: StoryObj<HeapingArgs> = {
  render: ({ physics, lifted, lift, gripWidth, gripMin, gripMax, heap, reach }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      undefined,
      true,
      { w: gripWidth, min: gripMin, max: gripMax },
      {},
      twoPairs(heap, reach),
      false,
      0,
      mergeRule(MERGE_SHARE),
    ),
  args: { ...STACK_ARGS, lifted: true, heap: NAMES[0], reach: MERGE_REACH },
  argTypes: { ...STACK_KNOBS, heap: HEAP, reach: REACH },
  parameters: { gkDocStory: "heaping.heap" },
};
