import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { grabScene } from "./gestureScene.js";
import {
  GRIP_MAX,
  GRIP_MIN,
  GRIP_MISS_KNOB,
  GRIP_W,
  LIFT,
  LIFTED,
  PHYSICS,
  STACKING,
} from "./gestureKnobs.js";

// GRIPS — drag handles for heaps.
//
// A handle is a picture of a heap, not a thing on the desk, and the difference is its identity:
// each is named afresh so it appears at its rest and does not fly in from nowhere.

installStockCarries();
installStockFlips();

interface GripsArgs {
  physics: boolean;
  lifted: boolean;
  lift: number;
  stacking: boolean;
  gripWidth: number;
  gripMin: number;
  gripMax: number;
  gripMiss: number;
}

const meta: Meta<GripsArgs> = {
  title: "Engine/Grips",
  parameters: {
    gkDoc: "grips.component",
  },
  args: {
    physics: true,
    lifted: true,
    lift: 1.3,
    stacking: true,
    gripWidth: 0.6,
    gripMin: 0.8,
    gripMax: 1,
    gripMiss: 0.3,
  },
  argTypes: {
    physics: PHYSICS,
    lifted: LIFTED,
    lift: LIFT,
    stacking: STACKING,
    gripWidth: GRIP_W,
    gripMin: GRIP_MIN,
    gripMax: GRIP_MAX,
    gripMiss: GRIP_MISS_KNOB,
  },
};
export default meta;

export const Grips: StoryObj<GripsArgs> = {
  tags: ["!dev"],
  render: ({ physics, lifted, lift, stacking, gripWidth, gripMin, gripMax, gripMiss }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      "drop",
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax, miss: gripMiss },
      { card: "settle", chip: "fall", die: "roll" },
      "stack",
    ),
  parameters: { gkDocStory: "grips.grips" },
};
