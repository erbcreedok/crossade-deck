// ADD-ONS / DECKS — the deck DESIGN, as the add-on ships it: the same 55 cards as `Add-ons/Cards`,
// wearing a STYLE. A style is three switches (layout, four colours, Cyrillic) and every one of the
// eight combinations is a preset the add-on draws and bakes. The same panel sits on every page
// here, and one more switch beside it — VECTOR or RASTER — because the two are the same picture
// through two doors: the vector is what the add-on draws, the raster is that drawing baked once
// (`scripts/bake.ts`) into what a game ships. Flip the switch and nothing should move.
//
// The cards are imported BY PACKAGE NAME, like any consumer — never a path into the add-on's src.

import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Flippable,
  freeLayout,
  gridLayout,
  installStockFlips,
  node,
  rect,
  registerLayout,
  stack,
  Surfaced,
  Transformable,
  type Node,
} from "../../src/index.js";
import {
  BACK_NAMES,
  crossade,
  DECK_LAYOUTS,
  deckBackSurface,
  deckFaceSurface,
  installDeckBacks,
  installDeckSkin,
  type BackName,
  type DeckLayout,
  type DeckSource,
  type DeckStyle,
} from "@game-presets/cards";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// The turn is a stock recipe (`turnOver`): without it installed, a card asked to lie face down
// keeps showing its face, and a tap turns nothing.
installStockFlips();

const meta: Meta = {
  title: "Add-ons/Decks",
  parameters: { gkDoc: "decks.component" },
};
export default meta;

/** The style panel every page shares, and the door the picture comes through. */
interface DeckArgs {
  layout: DeckLayout;
  fourColour: boolean;
  cyrillic: boolean;
  source: DeckSource;
  back: BackName;
}

const DECK_ARGS: DeckArgs = { layout: "classic", fourColour: false, cyrillic: false, source: "raster", back: "plaid" };
const DECK_KNOBS = {
  layout: documented("arg.deckLayout", { control: "select", options: DECK_LAYOUTS }, "deck"),
  fourColour: documented("arg.fourColour", { control: { type: "boolean" } }, "deck"),
  cyrillic: documented("arg.cyrillic", { control: { type: "boolean" } }, "deck"),
  source: documented("arg.source", { control: "select", options: ["raster", "vector"] }, "deck"),
  back: documented("arg.back", { control: "select", options: BACK_NAMES }, "deck"),
};

const styleOf = (a: DeckArgs): DeckStyle => ({ layout: a.layout, fourColour: a.fourColour, cyrillic: a.cyrillic });

/** Install the panel's style through the panel's door. Idempotent, so a re-render costs nothing. */
function install(a: DeckArgs): DeckStyle {
  const style = styleOf(a);
  installDeckSkin(style, a.source);
  installDeckBacks(a.source);
  return style;
}

/** A camera that opens fitted to a desk of `w`×`h` units centred on the origin, and lets the reader zoom. */
function fitted(w: number, h: number) {
  return {
    limits: { minZoom: 0.2, maxZoom: 6, input: { zoom: true, pan: true, rotate: false } },
    content: { x: -w / 2, y: -h / 2, w, h },
    start: { zoom: "fit" as const },
  };
}

const CARD = "card";
const IDS = crossade().map((spec) => spec.id);

// ---------------------------------------------------------------- one card

interface CardArgs extends DeckArgs {
  card: string;
  faceUp: boolean;
}

/**
 * ONE CARD, big — the page to compare the two doors on: switch `source` and the picture must not
 * move by a pixel. Tap it to turn it over; the back is the panel's `back`.
 */
export const Card: StoryObj<CardArgs> = {
  render: (a) => {
    const style = install(a);
    const spec = crossade().find((c) => c.id === a.card) ?? crossade()[0]!;
    const card = node(
      CARD,
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced({ surface: deckFaceSurface(spec, style) }),
      Flippable({ flip: "turnOver", back: deckBackSurface(a.back), turns: a.faceUp ? 0 : 1 }),
    );
    return scene(card, { flipOnTap: true }).el;
  },
  args: { ...DECK_ARGS, card: "spade-A", faceUp: true },
  argTypes: {
    ...DECK_KNOBS,
    card: documented("arg.card", { control: "select", options: IDS }, "card"),
    faceUp: documented("arg.faceUp", { control: { type: "boolean" } }, "card"),
  },
  parameters: { gkDocStory: "decks.card" },
};

// ---------------------------------------------------------------- a pile

interface PileArgs extends DeckArgs {
  count: number;
  faceUp: boolean;
}

/** The first `count` cards of the set, in its own order — a run across the suits, courts included. */
function dealt(a: PileArgs, style: DeckStyle): Node[] {
  const back = deckBackSurface(a.back);
  return crossade()
    .slice(0, Math.max(0, Math.min(a.count, IDS.length)))
    .map((spec, i) =>
      node(
        spec.id,
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: deckFaceSurface(spec, style) }),
        Flippable({ flip: "turnOver", back, turns: a.faceUp ? 0 : 1 }),
        Transformable(stack(a.count)[i]),
      ),
    );
}

/**
 * A PILE — the kit's `stack()` pose, the same drift a game's deck has, so the edge of every card
 * under the top one shows what a stack of this style looks like on the felt: face up, the paper
 * and its index; face down, the back.
 */
export const Pile: StoryObj<PileArgs> = {
  render: (a) => {
    const style = install(a);
    registerLayout("story.decks.free", freeLayout);
    const pile = node("pile", Container({ layout: "story.decks.free" }));
    dealt(a, style).forEach((card) => add(pile, card));
    return scene(pile, { flipOnTap: true, camera: fitted(3, 3.6) }).el;
  },
  args: { ...DECK_ARGS, count: 12, faceUp: true },
  argTypes: {
    ...DECK_KNOBS,
    count: documented("arg.count", { control: { type: "number", min: 0, max: 55, step: 1 } }, "pile"),
    faceUp: documented("arg.faceUp", { control: { type: "boolean" } }, "pile"),
  },
  parameters: { gkDocStory: "decks.pile" },
};

// ---------------------------------------------------------------- the gallery

/** Thirteen to a row: a suit per row, then the jokers and the brand, then the six backs. */
const COLUMNS = 13;

/**
 * THE WHOLE DECK on one desk, and the backs under it — the page a style is judged on. Every face
 * of the set in the panel's style, through the panel's door; the backs are their own slot and stand
 * apart, because any deck wears any of them.
 */
export const Gallery: StoryObj<DeckArgs> = {
  render: (a) => {
    const style = install(a);
    registerLayout("story.decks.grid", gridLayout({ columns: COLUMNS, gap: 0.12 }));
    const desk = node("gallery", Container({ layout: "story.decks.grid" }));
    for (const spec of crossade()) {
      add(desk, node(spec.id, Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: deckFaceSurface(spec, style) })));
    }
    // The specials row is three wide; the backs take their own row after it.
    for (let i = crossade().length % COLUMNS; i < COLUMNS; i += 1) add(desk, node(`gap${i}`, Bounded({ bounds: rect(1, 1.4) })));
    for (const back of BACK_NAMES) {
      add(desk, node(`back-${back}`, Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: deckBackSurface(back) })));
    }
    // 13 columns and 6 rows — four suits, the specials, the backs — plus the gaps between them.
    return scene(desk, { camera: fitted(COLUMNS * 1.12 + 0.5, 6 * 1.52 + 0.5) }).el;
  },
  args: { ...DECK_ARGS },
  argTypes: { ...DECK_KNOBS },
  parameters: { gkDocStory: "decks.gallery" },
};
