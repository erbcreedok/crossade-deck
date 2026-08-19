import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  contentSwap,
  Flippable,
  flipNames,
  freeLayout,
  installStockFlips,
  node,
  radialLayout,
  rect,
  registerFlip,
  registerLayout,
  registerSurface,
  rowLayout,
  stackLayout,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { surfaceRecord } from "../../src/index.js";
import { BACK_SURFACE, crossade, faceSurface, installClassicSkin, type CardSpec } from "@game-presets/cards";
import { scene } from "../devtools/scene.js";

/** The ace of spades — the one card everybody recognises upside down and at a glance. */
const ACE = faceSurface(crossade().find((c: CardSpec) => c.id === "spade-A")!);
import { documented, PAINTS } from "./surfaceControls.js";

// FLIPPABLE draws nothing on its own — it says HOW a node turns, as data, and the engine's flip
// effect does the turning. A flip is geometry (a reflection the children inherit) plus, sometimes,
// content (the other face). Each scene is one use-case of the atom: a card turning over, a knight
// facing the other way, an arena cascading its reflection, a board whose back is a whole OTHER
// subtree, two deck modes side by side, the nested parity of case A, a mirror landing on live
// state, a row that trades the mirror for readability, and a card with no back that never blanks.
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
      flip: ["Card", "Arena", "Decks", "Row"],
      turns: ["Card", "Arena", "Stack", "Knight", "ContentBack", "Decks", "Nested", "MoveThenFlip", "Row", "EmptyBack"],
      axis: ["Card", "Arena", "Knight"],
      back: ["Card", "EmptyBack"],
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
    // THE REAL DECK, not two fills. A flip drawn as one coloured rectangle becoming another cannot
    // be told from a recolour — which is the ONE thing this scene exists to show. The paints below
    // still dress the pair when a reader picks them; by default it is an ace and a card back.
    installClassicSkin();
    registerSurface("story.flip.front", a.front ? { layers: [{ paint: a.front }], radius: 0.08 } : surfaceRecord(ACE)!);
    registerSurface("story.flip.back", a.back ? { layers: [{ paint: a.back }], radius: 0.08 } : surfaceRecord(BACK_SURFACE)!);
    return scene(
      node(
        a.id.trim() || "aceCard",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.flip.front" }),
        Flippable({ flip: a.flip || "turnOver", turns: a.turns, axis: a.axis, back: "story.flip.back" }),
      ),
    ).el;
  },
  // Empty paints on purpose: the scene opens on the REAL ace and the REAL back, and a reader who
  // picks a colour gets the flat pair back.
  args: { id: "aceCard", flip: "turnOver", turns: 1, axis: 90, front: "", back: "" },
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
    installClassicSkin();
    registerSurface("story.stack.front", surfaceRecord(ACE)!);
    registerSurface("story.stack.back", surfaceRecord(BACK_SURFACE)!);
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

// ---- Knight: a piece that faces the other way -----------------------------------------------

/** An asymmetric piece — a body with a head off to one side, so a mirror has something to show. */
function knight(id: string, atoms: readonly ReturnType<typeof Flippable>[] = []) {
  registerLayout("story.flip.free", freeLayout);
  registerSurface("story.flip.body", { layers: [{ paint: "panelBg" }], radius: 0.1 });
  registerSurface("story.flip.head", { layers: [{ paint: "accent" }], radius: 0.1 });
  const piece = node(id, Container({ layout: "story.flip.free" }), Surfaced({ surface: "story.flip.body" }), ...atoms);
  add(piece, node(`${id}.torso`, Bounded({ bounds: rect(0.7, 1) }), Surfaced({ surface: "story.flip.body" })));
  add(piece, node(`${id}.muzzle`, Bounded({ bounds: rect(0.45, 0.35) }), Surfaced({ surface: "story.flip.head" }), Transformable({ at: { x: 0.5, y: -0.45 } })));
  return piece;
}

interface KnightArgs {
  turns: number;
  axis: number;
}

export const Knight: StoryObj<KnightArgs> = {
  // A piece with a face: the muzzle sits to one side, so the mirror is visible on a single node —
  // turn it and the knight looks the other way. Nothing is swapped: `mirror` is pure geometry, and
  // the asymmetry is what reveals it. `axis` tilts the mirror line the piece turns about.
  render: (a) => scene(knight("knightPiece", [Flippable({ flip: "mirror", turns: a.turns, axis: a.axis })])).el,
  args: { turns: 1, axis: 90 },
  argTypes: { turns: turnsControl, axis: axisControl },
  parameters: { gkDocStory: "flippable.knight" },
};

// ---- ContentBack: the back is a whole other subtree (case C-1) ------------------------------

interface ContentBackArgs {
  turns: number;
}

export const ContentBack: StoryObj<ContentBackArgs> = {
  // The board whose back is not a colour but a WHOLE OTHER FACE: an iron top with a radial tray of
  // slices. The subtree lives in the recipe's REGISTRATION — the atom only names it — and the seam
  // draws the shown node's children, so the front's stack never bleeds through. No reflection: a
  // substitution is not a mirror.
  render: (a) => {
    registerSurface("story.flip.oak", { layers: [{ paint: "panelBg" }], radius: 0.04 });
    registerSurface("story.flip.iron", { layers: [{ paint: "sunkBg" }], radius: 0.04 });
    registerSurface("story.flip.slice", { layers: [{ paint: "alert" }], radius: 0.5 });
    registerLayout("story.flip.radial", radialLayout({ radius: 0.9 }));
    registerLayout("story.flip.row", rowLayout({ gap: 0.2 }));

    const iron = node("ironTop", Container({ layout: "story.flip.radial" }), Bounded({ bounds: rect(4, 3) }), Surfaced({ surface: "story.flip.iron" }));
    for (let i = 0; i < 6; i += 1) {
      add(iron, node(`pizzaSlice#${i}`, Bounded({ bounds: rect(0.5, 0.5) }), Surfaced({ surface: "story.flip.slice" })));
    }
    registerFlip("story.flip.ironBack", contentSwap(() => iron));

    const board = node(
      "oakBoard",
      Container({ layout: "story.flip.row" }),
      Bounded({ bounds: rect(4, 3) }),
      Surfaced({ surface: "story.flip.oak" }),
      Flippable({ flip: "story.flip.ironBack", turns: a.turns }),
    );
    add(board, node("oakStack", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "plate" })));
    return scene(board).el;
  },
  args: { turns: 1 },
  argTypes: { turns: turnsControl },
  parameters: { gkDocStory: "flippable.contentback" },
};

// ---- Decks: the two deck modes, side by side ------------------------------------------------

/** A fanned deck of three cards, each with its OWN back tint so the order stays readable over. */
function deck(id: string, flip: string, turns: number) {
  registerLayout("story.flip.fan", stackLayout({ offset: { x: 0.35, y: 0 } }));
  const d = node(id, Container({ layout: "story.flip.fan" }), Flippable({ flip, turns }));
  for (const [i, paint] of (["accent", "alert", "textMuted"] as const).entries()) {
    registerSurface(`story.flip.deckBack.${paint}`, { layers: [{ paint }], radius: 0.08 });
    add(
      d,
      node(
        `${id}.card#${i}`,
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.flip.front" }),
        Flippable({ flip: "turnOver", back: `story.flip.deckBack.${paint}` }),
      ),
    );
  }
  return d;
}

interface DecksArgs {
  turns: number;
}

export const Decks: StoryObj<DecksArgs> = {
  // TWO DECKS, one turn. The left flips as one physical thing — `deckReorder`, the order reverses
  // with the cards. The right is the client2 alternative — `deckChildren`, cards turn in place and
  // the order stays. Each card keeps its own back tint, so the difference is readable face-down.
  // Both decks' cards show their backs through the SUMMED parity; neither recipe touches a card.
  render: (a) => {
    registerSurface("story.flip.front", { layers: [{ paint: "panelBg" }], radius: 0.08 });
    registerLayout("story.flip.pair", rowLayout({ gap: 1.2 }));
    const desk = node("deckDesk", Container({ layout: "story.flip.pair" }));
    add(desk, deck("reorderDeck", "deckReorder", a.turns));
    add(desk, deck("keepDeck", "deckChildren", a.turns));
    return scene(desk).el;
  },
  args: { turns: 1 },
  argTypes: { turns: turnsControl },
  parameters: { gkDocStory: "flippable.decks" },
};

// ---- Nested: a container of mixed recipes, case A live --------------------------------------

interface NestedArgs {
  turns: number;
  reflipOne: boolean;
}

export const Nested: StoryObj<NestedArgs> = {
  // A tray holding a lone card, a reordering deck and a keep-order deck. One turn of the TRAY sums
  // into everything: each node answers with its OWN recipe — the card turns over, one deck
  // reverses, the other does not. `reflipOne` turns the lone card once more: its summed parity is
  // even again, face-up amid a turned world — case A, out of the arithmetic alone.
  render: (a) => {
    registerSurface("story.flip.front", { layers: [{ paint: "panelBg" }], radius: 0.08 });
    registerSurface("story.flip.back", { layers: [{ paint: "accent" }], radius: 0.08 });
    registerLayout("story.flip.tray", rowLayout({ gap: 1 }));
    const tray = node("mixedTray", Container({ layout: "story.flip.tray" }), Flippable({ turns: a.turns }));
    add(
      tray,
      node(
        "loneCard",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.flip.front" }),
        Flippable({ flip: "turnOver", back: "story.flip.back", turns: a.reflipOne ? 1 : 0 }),
      ),
    );
    add(tray, deck("nestedReorder", "deckReorder", 0));
    add(tray, deck("nestedKeep", "deckChildren", 0));
    return scene(tray).el;
  },
  args: { turns: 1, reflipOne: false },
  argTypes: {
    turns: turnsControl,
    reflipOne: documented("arg.reflipOne", {}, "flip"),
  },
  parameters: { gkDocStory: "flippable.nested" },
};

// ---- MoveThenFlip: the mirror lands on live state (case D) ----------------------------------

interface MoveThenFlipArgs {
  driftX: number;
  driftY: number;
  turns: number;
}

export const MoveThenFlip: StoryObj<MoveThenFlipArgs> = {
  // Move the pawn, THEN turn the board: the mirror lands on where the pawn is NOW, not where it
  // was authored. Nothing is stored — the reflection composes over the live pose, so the last
  // state is what turns. Drag the drift with the board turned and watch the mirrored pawn answer.
  render: (a) => {
    registerLayout("story.flip.board", freeLayout);
    registerSurface("story.flip.oak", { layers: [{ paint: "panelBg" }], radius: 0.04 });
    registerSurface("story.flip.pawn", { layers: [{ paint: "accent" }], radius: 0.3 });
    const board = node(
      "liveBoard",
      Container({ layout: "story.flip.board" }),
      Bounded({ bounds: rect(4, 3) }),
      Surfaced({ surface: "story.flip.oak" }),
      Flippable({ flip: "mirror", turns: a.turns }),
    );
    add(
      board,
      node(
        "livePawn",
        Bounded({ bounds: rect(0.6, 0.6) }),
        Surfaced({ surface: "story.flip.pawn" }),
        Transformable({ at: { x: a.driftX, y: a.driftY } }),
      ),
    );
    return scene(board).el;
  },
  args: { driftX: 1.2, driftY: 0.5, turns: 1 },
  argTypes: {
    driftX: documented("arg.driftX", { control: { type: "range", min: -1.6, max: 1.6, step: 0.1 } }, "flip"),
    driftY: documented("arg.driftY", { control: { type: "range", min: -1.2, max: 1.2, step: 0.1 } }, "flip"),
    turns: turnsControl,
  },
  parameters: { gkDocStory: "flippable.movethenflip" },
};

// ---- Row: the geometric mirror against the readable direction-flip --------------------------

/** A row of tiles, each with a corner dot — the asymmetry that tells a mirror from a reorder. */
function letterRow(id: string, flip: string, turns: number) {
  registerLayout("story.flip.letters", rowLayout({ gap: 0.2 }));
  registerLayout("story.flip.glyph", freeLayout);
  registerSurface("story.flip.dot", { layers: [{ paint: "alert" }], radius: 0.5 });
  const row = node(id, Container({ layout: "story.flip.letters" }), Flippable({ flip, turns }));
  for (const [i, paint] of (["accent", "textMuted", "panelBg"] as const).entries()) {
    registerSurface(`story.flip.letter.${paint}`, { layers: [{ paint }], radius: 0.06 });
    const tile = node(`${id}.tile#${i}`, Container({ layout: "story.flip.glyph" }), Bounded({ bounds: rect(0.8, 1.1) }), Surfaced({ surface: `story.flip.letter.${paint}` }));
    add(tile, node(`${id}.dot#${i}`, Bounded({ bounds: rect(0.16, 0.16) }), Surfaced({ surface: "story.flip.dot" }), Transformable({ at: { x: 0.24, y: -0.36 } })));
    add(row, tile);
  }
  return row;
}

interface RowArgs {
  turns: number;
}

export const Row: StoryObj<RowArgs> = {
  // The same row twice, one turn. Above, `mirror`: the tiles come back reversed AND each is
  // reflected — the corner dots jump sides, the way glyphs would. Below, `directionFlip`: the
  // order reverses and nothing mirrors, so the dots stay put and a word would stay readable. The
  // trade is real — a mirror keeps hand-moved offsets turning (case D), the direction flip loses
  // them — and the NODE picks, by naming its recipe.
  render: (a) => {
    registerLayout("story.flip.rows", rowLayout({ gap: 0.6, direction: "column" }));
    const board = node("rowBoard", Container({ layout: "story.flip.rows" }));
    add(board, letterRow("mirrorRow", "mirror", a.turns));
    add(board, letterRow("readableRow", "directionFlip", a.turns));
    return scene(board).el;
  },
  args: { turns: 1 },
  argTypes: { turns: turnsControl },
  parameters: { gkDocStory: "flippable.row" },
};

// ---- EmptyBack: a turn never blanks the card ------------------------------------------------

interface EmptyBackArgs {
  turns: number;
}

export const EmptyBack: StoryObj<EmptyBackArgs> = {
  // A `turnOver` card whose `back` is empty: the turn falls through to the front — mirrored, since
  // the geometry still happens — and never a blank. A token identical on both sides needs no back,
  // and a half-built card stays visible while its art is on the way.
  render: (a) => {
    registerSurface("story.flip.front", { layers: [{ paint: "panelBg" }], radius: 0.08 });
    return scene(
      node(
        "tokenCard",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.flip.front" }),
        Flippable({ flip: "turnOver", back: "", turns: a.turns }),
      ),
    ).el;
  },
  args: { turns: 1 },
  argTypes: { turns: turnsControl },
  parameters: { gkDocStory: "flippable.emptyback" },
};
