import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { grabScene } from "./gestureScene.js";
import {
  LANDING,
  LIFT,
  LIFTED,
  PHYSICS,
} from "./gestureKnobs.js";

// LANDING — the picture of where a carried run will come down.
//
// The finger holds the handle and the outline of the landing. The load itself hangs above both,
// clear of the answer.

installStockCarries();
installStockFlips();

interface LandingArgs {
  physics: boolean;
  lifted: boolean;
  lift: number;
  landing: boolean;
}

const meta: Meta<LandingArgs> = {
  title: "Engine/Landing",
  parameters: {
    gkDoc: "landing.component",
  },
  args: {
    physics: true,
    lifted: true,
    lift: 1.3,
    landing: true,
  },
  argTypes: {
    physics: PHYSICS,
    lifted: LIFTED,
    lift: LIFT,
    landing: LANDING,
  },
};
export default meta;

export const Landing: StoryObj<LandingArgs> = {
  tags: ["!dev"],
  render: ({ physics, lifted, lift, landing }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      "drop",
      false,
      undefined,
      { card: "settle" },
      "map",
      false,
      0,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      landing,
    ),
  parameters: { gkDocStory: "landing.landing" },
};
