import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Flippable,
  flipNames,
  installStockFlips,
  node,
  rect,
  registerLayout,
  registerSurface,
  rowLayout,
  Surfaced,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// FLIPPABLE draws nothing on its own — it says HOW a node turns, as data, and the engine's flip
// effect does the turning. A flip is geometry (a reflection the children inherit) plus, sometimes,
// content (the other face). `Card` is one card turning over; `Arena` is the reflection cascading to a
// container's children; `Stack` is case A — a stack turns its cards, and re-flipping one brings it
// upright on its own, out of the parity of `turns` alone.
//
// The recipes and the effect are installed here, as an ordinary consumer would.
installStockFlips();

const FLIPS = ["", ...flipNames()];

/** Turns control, shared: whole steps, because a turn is whole. Parity is what the effect reads. */
const turnsControl = documented("arg.turns", { control: { type: "range", min: 0, max: 3, step: 1 } }, "flip");
const axisControl = documented("arg.axis", { control: { type: "number", step: 1 } }, "flip");
const flipControl = documented("arg.flip", { control: "select", options: FLIPS }, "flip");

const meta: Meta = {
  title: "Atoms/Flippable",
  parameters: {
    gkDoc: "flippable.component",
    gkAtom: "Flippable",
    // Which scenes teach which field, checked by `guard.every-field-has-a-control`.
    gkFields: {
      flip: ["Card", "Arena"],
      turns: ["Card", "Arena", "Stack"],
      axis: ["Card", "Arena"],
      back: ["Card"],
    },
  },
};
export default meta;

// ---- Card: one card, front and back ---------------------------------------------------------

interface CardArgs {
  id: string;
  flip: string;
  turns: number;
  axis: number;
  front: string;
  back: string;
}

export const Card: StoryObj<CardArgs> = {
  // ONE CARD. Drag `turns`: even is face-up, odd shows the back AND mirrors — the two together are a
  // real turn, det through zero. `turnOver` is the recipe that swaps the surface; `mirror` only
  // reflects. `axis` is the mirror line, a parameter — 90 is a Y-flip, 76 is a 76° one.
  render: (a) => {
    registerSurface("story.flip.front", { layers: [{ paint: a.front }], radius: 0.08 });
    registerSurface("story.flip.back", { layers: [{ paint: a.back }], radius: 0.08 });
    return scene(
      node(
        a.id.trim() || "aceCard",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.flip.front" }),
        Flippable({ flip: a.flip || "turnOver", turns: a.turns, axis: a.axis, back: "story.flip.back" }),
      ),
    ).el;
  },
  args: { id: "aceCard", flip: "turnOver", turns: 1, axis: 90, front: "panelBg", back: "accent" },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    flip: flipControl,
    turns: turnsControl,
    axis: axisControl,
    front: documented("arg.front", { control: "select", options: PAINTS }, "flip"),
    back: documented("arg.back", { control: "select", options: PAINTS }, "flip"),
  },
  parameters: { gkDocStory: "flippable.card" },
};

// ---- Arena: the reflection cascades to the children -----------------------------------------

interface ArenaArgs {
  flip: string;
  turns: number;
  axis: number;
}

export const Arena: StoryObj<ArenaArgs> = {
  // A container turned over: the reflection is inherited through the chain, so its children mirror
  // WITH it — a row of tiles comes back in reverse screen order. Nothing walks the tree; the geometry
  // composes down it. Change `axis` and the mirror line turns with the whole arena.
  render: (a) => {
    registerLayout("story.arena.row", rowLayout({ gap: 0.2 }));
    for (const [name, paint] of [["accentTile", "accent"], ["alertTile", "alert"], ["mutedTile", "textMuted"]] as const) {
      registerSurface(`story.arena.${name}`, { layers: [{ paint }], radius: 0.06 });
    }
    const arena = node(
      "glassArena",
      Container({ layout: "story.arena.row" }),
      Surfaced({ surface: "story.arena.accentTile" }),
      Flippable({ flip: a.flip || "mirror", turns: a.turns, axis: a.axis }),
    );
    for (const name of ["accentTile", "alertTile", "mutedTile"]) {
      add(arena, node(`arena.${name}`, Bounded({ bounds: rect(0.8, 1.1) }), Surfaced({ surface: `story.arena.${name}` })));
    }
    return scene(arena).el;
  },
  args: { flip: "mirror", turns: 1, axis: 90 },
  argTypes: { flip: flipControl, turns: turnsControl, axis: axisControl },
  parameters: { gkDocStory: "flippable.arena" },
};

// ---- Stack: case A, the parity resolves itself ----------------------------------------------

interface StackArgs {
  turns: number;
  reflipOne: boolean;
}

export const Stack: StoryObj<StackArgs> = {
  // A stack turns its cards: `turns` SUMS along the chain, so flipping the stack shows every card's
  // back. Turn on `reflipOne` and the second card turns once MORE — its summed parity is even again,
  // so it is face-up while its neighbour stays face-down, and its two reflections cancel. Case A,
  // out of the arithmetic alone.
  render: (a) => {
    registerLayout("story.stack.row", rowLayout({ gap: 0.25 }));
    registerSurface("story.stack.front", { layers: [{ paint: "panelBg" }], radius: 0.08 });
    registerSurface("story.stack.back", { layers: [{ paint: "accent" }], radius: 0.08 });
    const stack = node(
      "deckStack",
      Container({ layout: "story.stack.row" }),
      Flippable({ turns: a.turns }),
    );
    const build = (id: string, extraTurns: number) =>
      node(
        id,
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.stack.front" }),
        Flippable({ flip: "turnOver", back: "story.stack.back", turns: extraTurns }),
      );
    add(stack, build("leftCard", 0));
    add(stack, build("rightCard", a.reflipOne ? 1 : 0));
    return scene(stack).el;
  },
  args: { turns: 1, reflipOne: false },
  argTypes: {
    turns: turnsControl,
    reflipOne: documented("arg.reflipOne", {}, "flip"),
  },
  parameters: { gkDocStory: "flippable.stack" },
};
