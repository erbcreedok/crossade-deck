// ENGINE / MOTION — the settle, watched without a drag. game-kit does not teleport a node from one
// resting pose to the next: it keeps the node's identity and eases it across on the one clock. A
// control change here IS a new tree, so toggling it plays the settle the same code plays in a game.
//
// The scene runs through `attachMotion` via `scene(desk, { animate: true })`; everything else is an
// ordinary tree. No timers, no per-story ticker — the reader drives the move by flipping a control.

import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Container, node, registerLayout, freeLayout, Surfaced, Transformable, type Node } from "../../src/index.js";
import { rect } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

const meta: Meta = {
  title: "Engine/Motion",
  parameters: { gkDoc: "motion.component" },
};
export default meta;

function piece(id: string, x: number, y: number): Node {
  return node(id, Bounded({ bounds: rect(1, 1.4) }), Surfaced(), Transformable({ at: { x, y } }));
}

/** A single token that eases between a left slot and a right one — flip the control and watch it go. */
export const Settle: StoryObj<{ right: boolean }> = {
  args: { right: false },
  argTypes: { right: documented("arg.right", { control: "boolean" }, "motion") },
  parameters: { gkDocStory: "motion.settle" },
  render: (args) => {
    registerLayout("story.motion.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    add(desk, piece("token", args.right ? 2.4 : -2.4, 0));
    return scene(desk, { animate: true }).el;
  },
};

/** A stacked pack that fans into a row on deal — every card keeps its identity and springs to its seat. */
export const Deal: StoryObj<{ dealt: boolean }> = {
  args: { dealt: false },
  argTypes: { dealt: documented("arg.dealt", { control: "boolean" }, "motion") },
  parameters: { gkDocStory: "motion.deal" },
  render: (args) => {
    registerLayout("story.motion.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    const count = 5;
    for (let i = 0; i < count; i++) {
      // Stacked: all near the origin with a hair of drift. Dealt: spread evenly across a row.
      const x = args.dealt ? (i - (count - 1) / 2) * 1.3 : i * 0.04;
      const y = args.dealt ? 0 : i * 0.04;
      add(desk, piece(`card:${i}`, x, y));
    }
    return scene(desk, { animate: true }).el;
  },
};
