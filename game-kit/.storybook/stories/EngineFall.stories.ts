import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { grabScene } from "./gestureScene.js";
import {
  CARD_WAY,
  CHIP_WAY,
  DIE_WAY,
  DROPPING,
  LIFT,
  LIFTED,
  PHYSICS,
  THROWING,
  type ThrowArgs,
} from "./gestureKnobs.js";

// FALL — throwing, dropping, and settling.
//
// When a gesture ends, what a hand was holding is let go of: slow hands settle, fast hands throw,
// and heavy things fall. Everything here is pure kit data and ballistic calculations.

installStockCarries();
installStockFlips();

const meta: Meta<ThrowArgs> = {
  title: "Engine/Fall",
  parameters: {
    gkDoc: "fall.component",
  },
  args: {
    physics: true,
    lifted: true,
    lift: 1.3,
    dropping: true,
    throwing: true,
    cardDrop: "settle",
    chipDrop: "fall",
    dieDrop: "roll",
  },
  argTypes: {
    physics: PHYSICS,
    lifted: LIFTED,
    lift: LIFT,
    dropping: DROPPING,
    throwing: THROWING,
    cardDrop: CARD_WAY,
    chipDrop: CHIP_WAY,
    dieDrop: DIE_WAY,
  },
};
export default meta;

export const Fall: StoryObj<ThrowArgs> = {
  tags: ["!dev"],
  render: ({ physics, lifted, lift, dropping, throwing, cardDrop, chipDrop, dieDrop }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      false,
      undefined,
      { card: cardDrop, chip: chipDrop, die: dieDrop },
    ),
  parameters: { gkDocStory: "fall.fall" },
};
