import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockFlips } from "../../src/index.js";
import { grabScene } from "./gestureScene.js";
import { magnetMap, PULL, zoneNear } from "./magnetMap.js";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";

installStockCarries();
installStockFlips();

const meta: Meta = {
  title: "Mechanics/Magnetism",
  parameters: {
    gkDoc: "magnetism.component",
    // The atom's own page: `Reaching` is one field, and this is the scene that makes it visible —
    // a number you can watch decide, on a desk where getting it wrong is a move that did not happen.
    gkAtom: "Reaching",
    gkFields: { reach: ["pull"] },
  },
};
export default meta;

interface MagnetArgs extends StackArgs {
  /** How far the zone reaches past its own border, root units. `0` and only a release ON it counts. */
  pull: number;
}

/**
 * ITS OWN NUMBER, in units, and turn on `bounds` to see it: the zone's border swept by a disc of
 * that radius is drawn around it, so what the reader is changing is on the glass and not in a rule.
 */
const PULL_KNOB = documented("arg.pull", { control: { type: "number", min: 0, step: 0.05 } }, "magnetism");

/**
 * MAGNETISM — a zone takes a card let go of NEAR it, not only ON it.
 *
 * Thirty-six cards in a deck and one bordered zone across the felt. Drag a card over and let go
 * short of the border: it goes in anyway, and squares up with whatever is already there. Let go
 * further out and it stays where it was put.
 *
 * A drop is otherwise decided by a POINT — the finger comes up somewhere and whatever container is
 * under that somewhere gets the card. Exact, and the wrong kind of exact: a player aiming at their
 * own area is not aiming at a pixel, they move the card over there and let go, and "over there" is
 * a place with a size. Miss by the width of the card's own border and the card stays on the felt,
 * which reads as the desk refusing a move that was plainly made.
 *
 * So the zone REACHES (`Reaching`), and nothing else about the drop changes: the same seam, the same
 * accept rule, the same re-parent, the same layout squaring the cards up. Turn the pull to zero and
 * the desk is every other desk — the release has to land inside the border.
 *
 * It is NOT a pull on the carried card. A held thing rides the hand one to one, which is a law of
 * this kit; a card that started drifting towards the zone under the finger would read as a dropped
 * frame rather than as attraction. The magnet acts at the release, which is also the only moment a
 * player is asking it anything.
 */
export const Magnetism: StoryObj<MagnetArgs> = {
  render: ({ physics, lifted, lift, dropping, throwing, stacking, gripWidth, gripMin, gripMax, cardDrop, chipDrop, dieDrop, pull }) =>
    grabScene(
      physics,
      lifted ? lift : undefined,
      dropping ? (throwing ? "throw" : "drop") : undefined,
      stacking,
      { w: gripWidth, min: gripMin, max: gripMax },
      { card: cardDrop, chip: chipDrop, die: dieDrop },
      () => magnetMap(pull),
      false,
      0,
      undefined,
      undefined,
      zoneNear,
    ),
  // Stacking off: a heap's handle would take the whole deck the moment a finger touched it, and this
  // page is about one card going somewhere. Dropping on, so a release away from the zone still falls
  // — the zone gets first refusal and the fall is what happens when it says no.
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: true, stacking: false, pull: PULL },
  argTypes: { ...STACK_KNOBS, pull: PULL_KNOB },
  parameters: { gkDocStory: "magnetism.scene" },
};
