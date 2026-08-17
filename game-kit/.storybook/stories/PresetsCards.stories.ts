// ADD-ONS / CARDS — the crossade deck, documented in the kit's catalog but built by a SEPARATE
// package (`@game-presets/cards`). The add-on ships its own suit shapes, card textures and the
// `cards()` builder; the engine carries none of that. Provenance for the reader lives in the page
// prose (the `cards` bundle); this file only assembles nodes and hands them to the scene shell.
//
// The cards are imported BY PACKAGE NAME, like any consumer — never a path into the add-on's src.

import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  byId,
  Container,
  freeLayout,
  installStockShuffles,
  node,
  permutation,
  rect,
  registerLayout,
  reorder,
  rowLayout,
  seededRng,
  Surfaced,
  Transformable,
  type Node,
} from "../../src/index.js";
import { BACK_SURFACE, deckByCardId } from "@game-presets/cards";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

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

interface ShuffleArgs {
  shuffled: number;
  seed: number;
  recipe: string;
}

/** What the standing scene last saw: the trigger and the order the hand stands in. */
const LAST = new WeakMap<HTMLElement, { shuffled: number; order: readonly number[] }>();
let LIVE: HTMLElement | undefined;
const HAND = ["spade-A", "spade-Q", "heart-10", "diamond-7", "club-K", "heart-2", "club-9"];

/**
 * THE ADD-ON'S CARDS, SHUFFLED ON THE CLOCK — the same three layers a game writes: the ORDER is the
 * kit's `permutation(n, seededRng(seed))` (every client that shares the seed lands the same hand),
 * the TRUTH is `reorder` on the row, and the LOOK is a stock recipe (`riffle` by default — the one
 * a pack of cards actually gets). Bump `shuffled` to shuffle again; the add-on's `shuffled()` is
 * this same permutation for a plain array, when a game shuffles data before it builds nodes.
 */
export const Shuffle: StoryObj<ShuffleArgs> = {
  render: (a) => {
    installStockShuffles();
    registerLayout("story.cards.row", rowLayout({ gap: 0.14, align: "center" }));
    const by = deckByCardId();
    const desk = node("desk", Container({ layout: "story.cards.free" }));
    registerLayout("story.cards.free", freeLayout);
    const hand = node("hand", Container({ layout: "story.cards.row" }), Transformable({ at: { x: 0, y: 0 } }));
    add(desk, hand);
    HAND.forEach((id) => add(hand, by.get(id)!));
    const seen = LIVE ? LAST.get(LIVE) : undefined;
    if (seen?.order && seen.order.length === HAND.length) reorder(hand, seen.order);
    const s = scene(desk, { animate: true });
    LIVE = s.el;
    const before = LAST.get(s.el);
    const standing = before?.order ?? HAND.map((_, i) => i);
    LAST.set(s.el, { shuffled: a.shuffled, order: standing });
    if (before && before.shuffled !== a.shuffled) {
      const live = byId(s.host.root, "hand");
      if (live) {
        const order = permutation(HAND.length, seededRng(a.seed + a.shuffled));
        LAST.set(s.el, { shuffled: a.shuffled, order: order.map((i) => standing[i]!) });
        s.motions?.shuffle("hand", () => reorder(live, order), { recipe: a.recipe });
      }
    }
    return s.el;
  },
  args: { shuffled: 0, seed: 11, recipe: "riffle" },
  argTypes: {
    shuffled: documented("arg.shuffled", { control: { type: "number", min: 0, step: 1 } }, "motion"),
    seed: documented("arg.seed", { control: { type: "number", step: 1 } }, "shuffle"),
    recipe: documented("arg.recipe", { control: "select", options: ["riffle", "overhand", "wash", "shake"] }, "shuffle"),
  },
  parameters: { gkDocStory: "cards.shuffle" },
};
