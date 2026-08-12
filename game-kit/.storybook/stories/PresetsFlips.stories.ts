import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  contentSwap,
  Flippable,
  freeLayout,
  installStockFlips,
  node,
  rect,
  registerFlip,
  registerLayout,
  registerSurface,
  rowLayout,
  stackLayout,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// PRESETS THAT TURN A NODE OVER — one page per stock flip mechanic, in isolation, drop-in.
//
// `Atoms/Flippable` teaches the atom through scenes; this shelf answers the narrower question a
// gamedev has — "what does this NAME already do, and how do I configure it". Six mechanics: the
// pure mirror, the card's turn-over, the two deck modes, the readable direction flip, and the
// content swap a consumer registers with their own subtree.
installStockFlips();

const turnsControl = documented("arg.turns", { control: { type: "range", min: 0, max: 3, step: 1 } }, "flip");
const axisControl = documented("arg.axis", { control: { type: "number", step: 1 } }, "flip");

const meta: Meta = {
  title: "Presets/Flips",
  parameters: { gkDoc: "presetsFlips.component" },
};
export default meta;

interface MirrorArgs {
  turns: number;
  axis: number;
}

export const Mirror: StoryObj<MirrorArgs> = {
  // Pure geometry, nothing swapped. Shown on a row of distinct tiles so the reflection is visible:
  // flip it and they come back in reverse screen order, mirrored about `axis`. The children inherit
  // it through the chain — nothing walks the tree.
  render: (a) => {
    registerLayout("preset.mirror.row", rowLayout({ gap: 0.2 }));
    for (const [name, paint] of [["a", "accent"], ["b", "alert"], ["c", "textMuted"]] as const) {
      registerSurface(`preset.mirror.${name}`, { layers: [{ paint }], radius: 0.06 });
    }
    const arena = node(
      "mirrorArena",
      Container({ layout: "preset.mirror.row" }),
      Surfaced({ surface: "preset.mirror.a" }),
      Flippable({ flip: "mirror", turns: a.turns, axis: a.axis }),
    );
    for (const name of ["a", "b", "c"]) {
      add(arena, node(`mirrorTile.${name}`, Bounded({ bounds: rect(0.8, 1.1) }), Surfaced({ surface: `preset.mirror.${name}` })));
    }
    return scene(arena).el;
  },
  args: { turns: 1, axis: 90 },
  argTypes: { turns: turnsControl, axis: axisControl },
  parameters: { gkDocStory: "presetsFlips.mirror" },
};

interface TurnOverArgs {
  turns: number;
  axis: number;
}

export const TurnOver: StoryObj<TurnOverArgs> = {
  // The card: reflection AND the other face. Even `turns` is face-up (the front), odd shows the back
  // surface and mirrors. An empty back would fall through to the front — a turn never blanks the card.
  render: (a) => {
    registerSurface("preset.turnover.front", { layers: [{ paint: "panelBg" }], radius: 0.08 });
    registerSurface("preset.turnover.back", { layers: [{ paint: "accent" }], radius: 0.08 });
    return scene(
      node(
        "turnCard",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "preset.turnover.front" }),
        Flippable({ flip: "turnOver", back: "preset.turnover.back", turns: a.turns, axis: a.axis }),
      ),
    ).el;
  },
  args: { turns: 1, axis: 90 },
  argTypes: { turns: turnsControl, axis: axisControl },
  parameters: { gkDocStory: "presetsFlips.turnover" },
};

interface TurnsArgs {
  turns: number;
}

/** A fanned deck of three cards with distinct back tints, so the order reads even face-down. */
function fannedDeck(id: string, flip: string, turns: number) {
  registerLayout("preset.deck.fan", stackLayout({ offset: { x: 0.35, y: 0 } }));
  registerSurface("preset.deck.front", { layers: [{ paint: "panelBg" }], radius: 0.08 });
  const d = node(id, Container({ layout: "preset.deck.fan" }), Flippable({ flip, turns }));
  for (const [i, paint] of (["accent", "alert", "textMuted"] as const).entries()) {
    registerSurface(`preset.deck.back.${paint}`, { layers: [{ paint }], radius: 0.08 });
    add(
      d,
      node(
        `${id}.card#${i}`,
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "preset.deck.front" }),
        Flippable({ flip: "turnOver", back: `preset.deck.back.${paint}` }),
      ),
    );
  }
  return d;
}

export const DeckReorder: StoryObj<TurnsArgs> = {
  // The deck turned as ONE PHYSICAL THING: the order reverses, the whole mirrors, every card shows
  // its back. The recipe only reorders — the cards' backs come from the summed parity, each by its
  // own recipe. Drop it on any container whose flip should reverse what is on it.
  render: (a) => scene(fannedDeck("reorderDeck", "deckReorder", a.turns)).el,
  args: { turns: 1 },
  argTypes: { turns: turnsControl },
  parameters: { gkDocStory: "presetsFlips.deckreorder" },
};

export const DeckChildren: StoryObj<TurnsArgs> = {
  // The alternative deck: cards turn in place, the order stays — the client2 keep-order mode. As
  // data this is `mirror` (the chain turns the children on its own); the name exists so a deck can
  // SAY its mode and swap it without touching a node.
  render: (a) => scene(fannedDeck("keepDeck", "deckChildren", a.turns)).el,
  args: { turns: 1 },
  argTypes: { turns: turnsControl },
  parameters: { gkDocStory: "presetsFlips.deckchildren" },
};

export const ContentSwap: StoryObj<TurnsArgs> = {
  // The face that is a whole OTHER subtree. `contentSwap` is a recipe-MAKER: the consumer hands it
  // the back as a thunk and registers the result under their own name — the atom only says
  // `flip: "that-name"`. References and config on the atom, the mechanism in the registry.
  render: (a) => {
    registerSurface("preset.swap.front", { layers: [{ paint: "panelBg" }], radius: 0.06 });
    registerSurface("preset.swap.iron", { layers: [{ paint: "sunkBg" }], radius: 0.06 });
    registerSurface("preset.swap.gem", { layers: [{ paint: "accent" }], radius: 0.5 });
    registerLayout("preset.swap.row", rowLayout({ gap: 0.25 }));
    const iron = node("ironFace", Container({ layout: "preset.swap.row" }), Bounded({ bounds: rect(3, 2) }), Surfaced({ surface: "preset.swap.iron" }));
    for (let i = 0; i < 3; i += 1) {
      add(iron, node(`gem#${i}`, Bounded({ bounds: rect(0.5, 0.5) }), Surfaced({ surface: "preset.swap.gem" })));
    }
    registerFlip("preset.swap.ironBack", contentSwap(() => iron));
    return scene(
      node(
        "swapBoard",
        Bounded({ bounds: rect(3, 2) }),
        Surfaced({ surface: "preset.swap.front" }),
        Flippable({ flip: "preset.swap.ironBack", turns: a.turns }),
      ),
    ).el;
  },
  args: { turns: 1 },
  argTypes: { turns: turnsControl },
  parameters: { gkDocStory: "presetsFlips.contentswap" },
};

export const DirectionFlip: StoryObj<TurnsArgs> = {
  // The readable row: the order reverses and NOTHING mirrors, so glyphs keep facing the reader.
  // Corner dots stand in for the glyphs — under `mirror` they would jump sides; here they stay.
  // The trade is the node's to make: a mirror keeps hand-moved offsets turning, this loses them.
  render: (a) => {
    registerLayout("preset.dir.row", rowLayout({ gap: 0.2 }));
    registerLayout("preset.dir.glyph", freeLayout);
    registerSurface("preset.dir.dot", { layers: [{ paint: "alert" }], radius: 0.5 });
    const row = node("readableRow", Container({ layout: "preset.dir.row" }), Flippable({ flip: "directionFlip", turns: a.turns }));
    for (const [i, paint] of (["accent", "textMuted", "panelBg"] as const).entries()) {
      registerSurface(`preset.dir.tile.${paint}`, { layers: [{ paint }], radius: 0.06 });
      const tile = node(`dirTile#${i}`, Container({ layout: "preset.dir.glyph" }), Bounded({ bounds: rect(0.8, 1.1) }), Surfaced({ surface: `preset.dir.tile.${paint}` }));
      add(tile, node(`dirDot#${i}`, Bounded({ bounds: rect(0.16, 0.16) }), Surfaced({ surface: "preset.dir.dot" }), Transformable({ at: { x: 0.24, y: -0.36 } })));
      add(row, tile);
    }
    return scene(row).el;
  },
  args: { turns: 1 },
  argTypes: { turns: turnsControl },
  parameters: { gkDocStory: "presetsFlips.directionflip" },
};
