// ADD-ONS / CARDS — the crossade deck, documented in the kit's catalog but built by a SEPARATE
// package (`@game-presets/cards`). The add-on ships its own suit shapes, card textures and the
// `cards()` builder; the engine carries none of that. Provenance for the reader lives in the page
// prose (the `cards` bundle); this file only assembles nodes and hands them to the scene shell.
//
// The cards are imported BY PACKAGE NAME, like any consumer — never a path into the add-on's src.

import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Container, node, rect, registerLayout, rowLayout, Surfaced, type Node } from "../../src/index.js";
import { BACK_SURFACE, deckByCardId } from "@game-presets/cards";
import { scene } from "../devtools/scene.js";

const meta: Meta = {
  title: "Add-ons/Cards",
  parameters: { gkDoc: "cards.component" },
};
export default meta;

/** A desk that lays its cards out in a row — the shell owns mount and paint. */
function row(cards: readonly Node[]): HTMLElement {
  registerLayout("story.cards.row", rowLayout({ gap: 0.14, align: "center" }));
  const desk = node("desk", Container({ layout: "story.cards.row" }));
  cards.forEach((card) => add(desk, card));
  return scene(desk).el;
}

export const Hand: StoryObj = {
  render: () => {
    const by = deckByCardId();
    const hand = ["spade-A", "spade-Q", "heart-10", "diamond-7", "club-K"].map((id) => by.get(id)!);
    return row(hand);
  },
  parameters: { gkDocStory: "cards.hand" },
};

export const Specials: StoryObj = {
  render: () => {
    const by = deckByCardId();
    // The shared back, shown directly beside the specials — the surface every card turns over to.
    const back = node("back", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: BACK_SURFACE }));
    return row([by.get("joker-red")!, by.get("joker-black")!, by.get("brand")!, back]);
  },
  parameters: { gkDocStory: "cards.specials" },
};
