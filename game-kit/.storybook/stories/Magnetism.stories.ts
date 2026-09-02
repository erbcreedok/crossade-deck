import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockCoats, installStockFlips } from "../../src/index.js";
import { magnetMap } from "./magnetMap.js";
import { magnetTune } from "./magnetMap.js";
import { MAGNET_ARGS, MAGNET_KNOBS, magnetScene, zoneSpread, type MagnetArgs } from "./magnetScene.js";

installStockCarries();
installStockCoats();
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
 * a place with a size.
 *
 * Cards on the felt heap as they do everywhere; the zone has a handle of its own whenever it holds
 * anything, and what it holds comes up as a FAN and goes back down as a row.
 */
export const Magnetism: StoryObj<MagnetArgs> = {
  render: (a) => magnetScene(a, () => magnetMap(a.pull, zoneSpread(a)), magnetTune(a.pull, zoneSpread(a))),
  args: { ...MAGNET_ARGS },
  argTypes: { ...MAGNET_KNOBS },
  parameters: { gkDocStory: "magnetism.scene" },
};
