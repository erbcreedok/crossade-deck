import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { grabScene } from "./gestureScene.js";
import {
  LIFT,
  LIFTED,
  PHYSICS,
  STACKING,
} from "./gestureKnobs.js";

// HEAPS — emergent islands of touching pieces of one kind.
//
// A heap on the felt is an accident of where pieces came to rest: nobody declared it, it is simply
// what is touching what, and it appears and vanishes as pieces move.

installStockCarries();
installStockFlips();

interface HeapsArgs {
  physics: boolean;
  lifted: boolean;
  lift: number;
  stacking: boolean;
}

const meta: Meta<HeapsArgs> = {
  title: "Engine/Heaps",
  parameters: {
    gkDoc: "heaps.component",
  },
  args: {
    physics: true,
    lifted: true,
    lift: 1.3,
    stacking: true,
  },
  argTypes: {
    physics: PHYSICS,
    lifted: LIFTED,
    lift: LIFT,
    stacking: STACKING,
  },
};
export default meta;

export const Heaps: StoryObj<HeapsArgs> = {
  tags: ["!dev"],
  render: ({ physics, lifted, lift, stacking }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      "drop",
      stacking,
      undefined,
      { card: "settle", chip: "fall", die: "roll" },
      "stack",
    ),
  parameters: { gkDocStory: "heaps.heaps" },
};
