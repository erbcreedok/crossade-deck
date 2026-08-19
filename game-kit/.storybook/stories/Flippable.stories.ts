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
  surfaceNames,
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

// THE CONTROLS ARE FACTORIES, not constants: every row says WHOSE field it is, and on a scene
// holding a tray, a deck and a card the same word means three different nodes. The section is
// therefore an argument — `"card/flippable"`, `"tray/layout"` — and the panel comes out a tree.

/** Turns control, shared: whole steps, because a turn is whole. Parity is what the effect reads. */
const turnsControl = (section: string): Record<string, unknown> =>
  documented("arg.turns", { control: { type: "range", min: 0, max: 3, step: 1 } }, section);
const axisControl = (section: string): Record<string, unknown> =>
  documented("arg.axis", { control: { type: "number", step: 1 } }, section);
const flipControl = (section: string): Record<string, unknown> =>
  documented("arg.flip", { control: "select", options: FLIPS }, section);
/** A layer's colour token — the record's own field, never a raw colour. */
const fillControl = (section: string): Record<string, unknown> =>
  documented("arg.fill", { control: "select", options: PAINTS }, section);
const radiusControl = (section: string): Record<string, unknown> =>
  documented("arg.radius", { control: { type: "number", min: 0, step: 0.02 } }, section);
/** A box in units: a size is a value to state, so a number field and not a slider. */
const sizeControl = (section: string, key: "arg.w" | "arg.h"): Record<string, unknown> =>
  documented(key, { control: { type: "number", min: 0, step: 0.1 } }, section);
const gapControl = (section: string): Record<string, unknown> =>
  documented("arg.gap", { control: { type: "number", min: 0, step: 0.05 } }, section);
const placeControl = (section: string, key: "arg.x" | "arg.y"): Record<string, unknown> =>
  documented(key, { control: { type: "range", min: -2, max: 2, step: 0.02 } }, section);

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
  w: number;
  h: number;
  front: string;
  back: string;
  radius: number;
  flip: string;
  turns: number;
  axis: number;
}

export const Card: StoryObj<CardArgs> = {
  // ONE CARD. Drag `turns`: even is face-up, odd shows the back AND mirrors — the two together are a
  // real turn, det through zero. `turnOver` is the recipe that swaps the surface; `mirror` only
  // reflects. `axis` is the mirror line, a parameter — 90 is a Y-flip, 76 is a 76° one.
  render: ({ id, w, h, front, back, radius, flip, turns, axis }) => {
    // Two fills cannot show a flip apart from a recolour. Real deck by default; a picked paint wins.
    installClassicSkin();
    registerSurface("story.flip.front", front ? { layers: [{ paint: front }], radius } : surfaceRecord(ACE)!);
    registerSurface("story.flip.back", back ? { layers: [{ paint: back }], radius } : surfaceRecord(BACK_SURFACE)!);
    return scene(
      node(
        id.trim() || "aceCard",
        Bounded({ bounds: rect(w, h) }),
        Surfaced({ surface: "story.flip.front" }),
        Flippable({ flip: flip || "turnOver", turns, axis, back: "story.flip.back" }),
      ),
    ).el;
  },
  // Empty paints: opens on the real ace and back.
  args: { id: "aceCard", w: 1, h: 1.4, front: "", back: "", radius: 0.08, flip: "turnOver", turns: 1, axis: 90 },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "card"),
    w: sizeControl("card/bounds", "arg.w"),
    h: sizeControl("card/bounds", "arg.h"),
    // EMPTY IS THE AUTHORED FACE — the classic skin's ace and its back. A token replaces it.
    front: documented("arg.front", { control: "select", options: ["", ...PAINTS] }, "card/surface"),
    back: documented("arg.back", { control: "select", options: ["", ...PAINTS] }, "card/surface"),
    radius: radiusControl("card/surface"),
    flip: flipControl("card/flippable"),
    turns: turnsControl("card/flippable"),
    axis: axisControl("card/flippable"),
  },
  parameters: { gkDocStory: "flippable.card" },
};

// ---- Arena: the reflection cascades to the children -----------------------------------------

interface ArenaArgs {
  gap: number;
  arenaFill: string;
  arenaRadius: number;
  tileW: number;
  tileH: number;
  tile0: string;
  tile1: string;
  tile2: string;
  tileRadius: number;
  flip: string;
  turns: number;
  axis: number;
}

export const Arena: StoryObj<ArenaArgs> = {
  // A container turned over: the reflection is inherited through the chain, so its children mirror
  // WITH it — a row of tiles comes back in reverse screen order. Nothing walks the tree; the geometry
  // composes down it. Change `axis` and the mirror line turns with the whole arena.
  render: ({ gap, arenaFill, arenaRadius, tileW, tileH, tile0, tile1, tile2, tileRadius, flip, turns, axis }) => {
    registerLayout("story.arena.row", rowLayout({ gap }));
    registerSurface("story.arena.plate", { layers: [{ paint: arenaFill }], radius: arenaRadius });
    const arena = node(
      "glassArena",
      Container({ layout: "story.arena.row" }),
      Surfaced({ surface: "story.arena.plate" }),
      Flippable({ flip: flip || "mirror", turns, axis }),
    );
    for (const [i, paint] of [tile0, tile1, tile2].entries()) {
      registerSurface(`story.arena.tile.${i}`, { layers: [{ paint }], radius: tileRadius });
      add(arena, node(`arenaTile#${i}`, Bounded({ bounds: rect(tileW, tileH) }), Surfaced({ surface: `story.arena.tile.${i}` })));
    }
    return scene(arena).el;
  },
  args: {
    gap: 0.2,
    arenaFill: "accent",
    arenaRadius: 0.06,
    tileW: 0.8,
    tileH: 1.1,
    tile0: "accent",
    tile1: "alert",
    tile2: "textMuted",
    tileRadius: 0.06,
    flip: "mirror",
    turns: 1,
    axis: 90,
  },
  argTypes: {
    gap: gapControl("arena/layout"),
    arenaFill: fillControl("arena/surface"),
    arenaRadius: radiusControl("arena/surface"),
    tileW: sizeControl("tiles/bounds", "arg.w"),
    tileH: sizeControl("tiles/bounds", "arg.h"),
    // Three tiles, three tokens — the screen order is what comes back reversed.
    tile0: fillControl("tiles/surface"),
    tile1: fillControl("tiles/surface"),
    tile2: fillControl("tiles/surface"),
    tileRadius: radiusControl("tiles/surface"),
    flip: flipControl("arena/flippable"),
    turns: turnsControl("arena/flippable"),
    axis: axisControl("arena/flippable"),
  },
  parameters: { gkDocStory: "flippable.arena" },
};

// ---- Stack: case A, the parity resolves itself ----------------------------------------------

interface StackArgs {
  gap: number;
  w: number;
  h: number;
  turns: number;
  reflipOne: boolean;
}

export const Stack: StoryObj<StackArgs> = {
  // A stack turns its cards: `turns` SUMS along the chain, so flipping the stack shows every card's
  // back. Turn on `reflipOne` and the second card turns once MORE — its summed parity is even again,
  // so it is face-up while its neighbour stays face-down, and its two reflections cancel. Case A,
  // out of the arithmetic alone.
  render: ({ gap, w, h, turns, reflipOne }) => {
    registerLayout("story.stack.row", rowLayout({ gap }));
    installClassicSkin();
    registerSurface("story.stack.front", surfaceRecord(ACE)!);
    registerSurface("story.stack.back", surfaceRecord(BACK_SURFACE)!);
    const stack = node("deckStack", Container({ layout: "story.stack.row" }), Flippable({ turns }));
    const build = (id: string, extraTurns: number) =>
      node(
        id,
        Bounded({ bounds: rect(w, h) }),
        Surfaced({ surface: "story.stack.front" }),
        Flippable({ flip: "turnOver", back: "story.stack.back", turns: extraTurns }),
      );
    add(stack, build("leftCard", 0));
    add(stack, build("rightCard", reflipOne ? 1 : 0));
    return scene(stack).el;
  },
  args: { gap: 0.25, w: 1, h: 1.4, turns: 1, reflipOne: false },
  argTypes: {
    gap: gapControl("stack/layout"),
    w: sizeControl("cards/bounds", "arg.w"),
    h: sizeControl("cards/bounds", "arg.h"),
    turns: turnsControl("stack/flippable"),
    reflipOne: documented("arg.reflipOne", {}, "rightCard/flippable"),
  },
  parameters: { gkDocStory: "flippable.stack" },
};

// ---- Knight: a piece that faces the other way -----------------------------------------------

/** Every number the piece is drawn from — one object, so the scene's panel IS its parameters. */
interface KnightShape {
  readonly bodyFill: string;
  readonly bodyRadius: number;
  readonly torsoW: number;
  readonly torsoH: number;
  readonly headFill: string;
  readonly headRadius: number;
  readonly muzzleW: number;
  readonly muzzleH: number;
  readonly muzzleX: number;
  readonly muzzleY: number;
}

/** An asymmetric piece — a body with a head off to one side, so a mirror has something to show. */
function knight(id: string, shape: KnightShape, atoms: readonly ReturnType<typeof Flippable>[] = []) {
  registerLayout("story.flip.free", freeLayout);
  registerSurface("story.flip.body", { layers: [{ paint: shape.bodyFill }], radius: shape.bodyRadius });
  registerSurface("story.flip.head", { layers: [{ paint: shape.headFill }], radius: shape.headRadius });
  const piece = node(id, Container({ layout: "story.flip.free" }), Surfaced({ surface: "story.flip.body" }), ...atoms);
  add(piece, node(`${id}.torso`, Bounded({ bounds: rect(shape.torsoW, shape.torsoH) }), Surfaced({ surface: "story.flip.body" })));
  add(
    piece,
    node(
      `${id}.muzzle`,
      Bounded({ bounds: rect(shape.muzzleW, shape.muzzleH) }),
      Surfaced({ surface: "story.flip.head" }),
      Transformable({ at: { x: shape.muzzleX, y: shape.muzzleY } }),
    ),
  );
  return piece;
}

interface KnightArgs extends KnightShape {
  turns: number;
  axis: number;
}

export const Knight: StoryObj<KnightArgs> = {
  // A piece with a face: the muzzle sits to one side, so the mirror is visible on a single node —
  // turn it and the knight looks the other way. Nothing is swapped: `mirror` is pure geometry, and
  // the asymmetry is what reveals it. `axis` tilts the mirror line the piece turns about.
  render: ({ turns, axis, ...shape }) => scene(knight("knightPiece", shape, [Flippable({ flip: "mirror", turns, axis })])).el,
  args: {
    bodyFill: "panelBg",
    bodyRadius: 0.1,
    torsoW: 0.7,
    torsoH: 1,
    headFill: "accent",
    headRadius: 0.1,
    muzzleW: 0.45,
    muzzleH: 0.35,
    muzzleX: 0.5,
    muzzleY: -0.45,
    turns: 1,
    axis: 90,
  },
  argTypes: {
    // The body's record is worn by the piece AND its torso — one registration, one pair of rows.
    bodyFill: fillControl("body surface"),
    bodyRadius: radiusControl("body surface"),
    torsoW: sizeControl("torso/bounds", "arg.w"),
    torsoH: sizeControl("torso/bounds", "arg.h"),
    muzzleW: sizeControl("muzzle/bounds", "arg.w"),
    muzzleH: sizeControl("muzzle/bounds", "arg.h"),
    headFill: fillControl("muzzle/surface"),
    headRadius: radiusControl("muzzle/surface"),
    // The offset that makes the piece asymmetric — take it to zero and the mirror shows nothing.
    muzzleX: placeControl("muzzle/transformable", "arg.x"),
    muzzleY: placeControl("muzzle/transformable", "arg.y"),
    turns: turnsControl("piece/flippable"),
    axis: axisControl("piece/flippable"),
  },
  parameters: { gkDocStory: "flippable.knight" },
};

// ---- ContentBack: the back is a whole other subtree (case C-1) ------------------------------

interface ContentBackArgs {
  oakW: number;
  oakH: number;
  oakFill: string;
  oakRadius: number;
  rowGap: number;
  stackW: number;
  stackH: number;
  stackSurface: string;
  ironW: number;
  ironH: number;
  ironFill: string;
  ironRadius: number;
  ringRadius: number;
  slices: number;
  sliceW: number;
  sliceH: number;
  sliceFill: string;
  sliceRadius: number;
  turns: number;
}

export const ContentBack: StoryObj<ContentBackArgs> = {
  // The board whose back is not a colour but a WHOLE OTHER FACE: an iron top with a radial tray of
  // slices. The subtree lives in the recipe's REGISTRATION — the atom only names it — and the seam
  // draws the shown node's children, so the front's stack never bleeds through. No reflection: a
  // substitution is not a mirror.
  render: ({
    oakW,
    oakH,
    oakFill,
    oakRadius,
    rowGap,
    stackW,
    stackH,
    stackSurface,
    ironW,
    ironH,
    ironFill,
    ironRadius,
    ringRadius,
    slices,
    sliceW,
    sliceH,
    sliceFill,
    sliceRadius,
    turns,
  }) => {
    registerSurface("story.flip.oak", { layers: [{ paint: oakFill }], radius: oakRadius });
    registerSurface("story.flip.iron", { layers: [{ paint: ironFill }], radius: ironRadius });
    registerSurface("story.flip.slice", { layers: [{ paint: sliceFill }], radius: sliceRadius });
    registerLayout("story.flip.radial", radialLayout({ radius: ringRadius }));
    registerLayout("story.flip.row", rowLayout({ gap: rowGap }));

    const iron = node(
      "ironTop",
      Container({ layout: "story.flip.radial" }),
      Bounded({ bounds: rect(ironW, ironH) }),
      Surfaced({ surface: "story.flip.iron" }),
    );
    for (let i = 0; i < Math.max(0, Math.round(slices)); i += 1) {
      add(iron, node(`pizzaSlice#${i}`, Bounded({ bounds: rect(sliceW, sliceH) }), Surfaced({ surface: "story.flip.slice" })));
    }
    registerFlip("story.flip.ironBack", contentSwap(() => iron));

    const board = node(
      "oakBoard",
      Container({ layout: "story.flip.row" }),
      Bounded({ bounds: rect(oakW, oakH) }),
      Surfaced({ surface: "story.flip.oak" }),
      Flippable({ flip: "story.flip.ironBack", turns }),
    );
    add(board, node("oakStack", Bounded({ bounds: rect(stackW, stackH) }), Surfaced({ surface: stackSurface })));
    return scene(board).el;
  },
  args: {
    oakW: 4,
    oakH: 3,
    oakFill: "panelBg",
    oakRadius: 0.04,
    rowGap: 0.2,
    stackW: 1,
    stackH: 1.4,
    stackSurface: "plate",
    ironW: 4,
    ironH: 3,
    ironFill: "sunkBg",
    ironRadius: 0.04,
    ringRadius: 0.9,
    slices: 6,
    sliceW: 0.5,
    sliceH: 0.5,
    sliceFill: "alert",
    sliceRadius: 0.5,
    turns: 1,
  },
  argTypes: {
    oakW: sizeControl("oakBoard/bounds", "arg.w"),
    oakH: sizeControl("oakBoard/bounds", "arg.h"),
    oakFill: fillControl("oakBoard/surface"),
    oakRadius: radiusControl("oakBoard/surface"),
    rowGap: gapControl("oakBoard/layout"),
    turns: turnsControl("oakBoard/flippable"),
    stackW: sizeControl("oakStack/bounds", "arg.w"),
    stackH: sizeControl("oakStack/bounds", "arg.h"),
    stackSurface: documented("arg.surfaceName", { control: "select", options: surfaceNames() }, "oakStack/surface"),
    // The back's own subtree: a whole other board, and every number of it is here too.
    ironW: sizeControl("ironTop/bounds", "arg.w"),
    ironH: sizeControl("ironTop/bounds", "arg.h"),
    ironFill: fillControl("ironTop/surface"),
    ironRadius: radiusControl("ironTop/surface"),
    ringRadius: documented("arg.ringRadius", { control: { type: "number", min: 0, step: 0.05 } }, "ironTop/layout"),
    slices: documented("arg.count", { control: { type: "range", min: 0, max: 12, step: 1 } }, "slices"),
    sliceW: sizeControl("slices/bounds", "arg.w"),
    sliceH: sizeControl("slices/bounds", "arg.h"),
    sliceFill: fillControl("slices/surface"),
    sliceRadius: radiusControl("slices/surface"),
  },
  parameters: { gkDocStory: "flippable.contentback" },
};

// ---- Decks: the two deck modes, side by side ------------------------------------------------

/** The fan's own numbers — the step it deals by, the card it deals, and the three back tints. */
interface DeckSpec {
  readonly stepX: number;
  readonly stepY: number;
  readonly cardW: number;
  readonly cardH: number;
  readonly backs: readonly string[];
  readonly backRadius: number;
}

/** A fanned deck of three cards, each with its OWN back tint so the order stays readable over. */
function deck(id: string, flip: string, turns: number, spec: DeckSpec) {
  registerLayout("story.flip.fan", stackLayout({ offset: { x: spec.stepX, y: spec.stepY } }));
  const d = node(id, Container({ layout: "story.flip.fan" }), Flippable({ flip, turns }));
  for (const [i, paint] of spec.backs.entries()) {
    registerSurface(`story.flip.deckBack.${i}`, { layers: [{ paint }], radius: spec.backRadius });
    add(
      d,
      node(
        `${id}.card#${i}`,
        Bounded({ bounds: rect(spec.cardW, spec.cardH) }),
        Surfaced({ surface: "story.flip.front" }),
        Flippable({ flip: "turnOver", back: `story.flip.deckBack.${i}` }),
      ),
    );
  }
  return d;
}

interface DecksArgs {
  gap: number;
  stepX: number;
  stepY: number;
  cardW: number;
  cardH: number;
  frontFill: string;
  frontRadius: number;
  back0: string;
  back1: string;
  back2: string;
  backRadius: number;
  turns: number;
}

export const Decks: StoryObj<DecksArgs> = {
  // TWO DECKS, one turn. The left flips as one physical thing — `deckReorder`, the order reverses
  // with the cards. The right is the client2 alternative — `deckChildren`, cards turn in place and
  // the order stays. Each card keeps its own back tint, so the difference is readable face-down.
  // Both decks' cards show their backs through the SUMMED parity; neither recipe touches a card.
  render: ({ gap, stepX, stepY, cardW, cardH, frontFill, frontRadius, back0, back1, back2, backRadius, turns }) => {
    registerSurface("story.flip.front", { layers: [{ paint: frontFill }], radius: frontRadius });
    registerLayout("story.flip.pair", rowLayout({ gap }));
    const spec: DeckSpec = { stepX, stepY, cardW, cardH, backs: [back0, back1, back2], backRadius };
    const desk = node("deckDesk", Container({ layout: "story.flip.pair" }));
    add(desk, deck("reorderDeck", "deckReorder", turns, spec));
    add(desk, deck("keepDeck", "deckChildren", turns, spec));
    return scene(desk).el;
  },
  args: {
    gap: 1.2,
    stepX: 0.35,
    stepY: 0,
    cardW: 1,
    cardH: 1.4,
    frontFill: "panelBg",
    frontRadius: 0.08,
    back0: "accent",
    back1: "alert",
    back2: "textMuted",
    backRadius: 0.08,
    turns: 1,
  },
  argTypes: {
    gap: gapControl("desk/layout"),
    turns: turnsControl("decks/flippable"),
    // The fan's step is the stack record's offset, not a field of any card.
    stepX: documented("arg.stepX", { control: { type: "number", step: 0.05 } }, "decks/layout"),
    stepY: documented("arg.stepY", { control: { type: "number", step: 0.05 } }, "decks/layout"),
    cardW: sizeControl("cards/bounds", "arg.w"),
    cardH: sizeControl("cards/bounds", "arg.h"),
    frontFill: fillControl("cards/surface"),
    frontRadius: radiusControl("cards/surface"),
    back0: fillControl("card backs"),
    back1: fillControl("card backs"),
    back2: fillControl("card backs"),
    backRadius: radiusControl("card backs"),
  },
  parameters: { gkDocStory: "flippable.decks" },
};

// ---- Nested: a container of mixed recipes, case A live --------------------------------------

interface NestedArgs {
  gap: number;
  cardW: number;
  cardH: number;
  frontFill: string;
  backFill: string;
  radius: number;
  turns: number;
  reflipOne: boolean;
  stepX: number;
  stepY: number;
  deckBack0: string;
  deckBack1: string;
  deckBack2: string;
}

export const Nested: StoryObj<NestedArgs> = {
  // A tray holding a lone card, a reordering deck and a keep-order deck. One turn of the TRAY sums
  // into everything: each node answers with its OWN recipe — the card turns over, one deck
  // reverses, the other does not. `reflipOne` turns the lone card once more: its summed parity is
  // even again, face-up amid a turned world — case A, out of the arithmetic alone.
  render: ({ gap, cardW, cardH, frontFill, backFill, radius, turns, reflipOne, stepX, stepY, deckBack0, deckBack1, deckBack2 }) => {
    registerSurface("story.flip.front", { layers: [{ paint: frontFill }], radius });
    registerSurface("story.flip.back", { layers: [{ paint: backFill }], radius });
    registerLayout("story.flip.tray", rowLayout({ gap }));
    const tray = node("mixedTray", Container({ layout: "story.flip.tray" }), Flippable({ turns }));
    add(
      tray,
      node(
        "loneCard",
        Bounded({ bounds: rect(cardW, cardH) }),
        Surfaced({ surface: "story.flip.front" }),
        Flippable({ flip: "turnOver", back: "story.flip.back", turns: reflipOne ? 1 : 0 }),
      ),
    );
    const spec: DeckSpec = { stepX, stepY, cardW, cardH, backs: [deckBack0, deckBack1, deckBack2], backRadius: radius };
    add(tray, deck("nestedReorder", "deckReorder", 0, spec));
    add(tray, deck("nestedKeep", "deckChildren", 0, spec));
    return scene(tray).el;
  },
  args: {
    gap: 1,
    cardW: 1,
    cardH: 1.4,
    frontFill: "panelBg",
    backFill: "accent",
    radius: 0.08,
    turns: 1,
    reflipOne: false,
    stepX: 0.35,
    stepY: 0,
    deckBack0: "accent",
    deckBack1: "alert",
    deckBack2: "textMuted",
  },
  argTypes: {
    gap: gapControl("tray/layout"),
    turns: turnsControl("tray/flippable"),
    cardW: sizeControl("cards/bounds", "arg.w"),
    cardH: sizeControl("cards/bounds", "arg.h"),
    frontFill: fillControl("cards/surface"),
    backFill: fillControl("cards/surface"),
    radius: radiusControl("cards/surface"),
    reflipOne: documented("arg.reflipOne", {}, "loneCard/flippable"),
    stepX: documented("arg.stepX", { control: { type: "number", step: 0.05 } }, "decks/layout"),
    stepY: documented("arg.stepY", { control: { type: "number", step: 0.05 } }, "decks/layout"),
    deckBack0: fillControl("deck card backs"),
    deckBack1: fillControl("deck card backs"),
    deckBack2: fillControl("deck card backs"),
  },
  parameters: { gkDocStory: "flippable.nested" },
};

// ---- MoveThenFlip: the mirror lands on live state (case D) ----------------------------------

interface MoveThenFlipArgs {
  boardW: number;
  boardH: number;
  oakFill: string;
  oakRadius: number;
  pawnW: number;
  pawnH: number;
  pawnFill: string;
  pawnRadius: number;
  driftX: number;
  driftY: number;
  turns: number;
}

export const MoveThenFlip: StoryObj<MoveThenFlipArgs> = {
  // Move the pawn, THEN turn the board: the mirror lands on where the pawn is NOW, not where it
  // was authored. Nothing is stored — the reflection composes over the live pose, so the last
  // state is what turns. Drag the drift with the board turned and watch the mirrored pawn answer.
  render: ({ boardW, boardH, oakFill, oakRadius, pawnW, pawnH, pawnFill, pawnRadius, driftX, driftY, turns }) => {
    registerLayout("story.flip.board", freeLayout);
    registerSurface("story.flip.oak", { layers: [{ paint: oakFill }], radius: oakRadius });
    registerSurface("story.flip.pawn", { layers: [{ paint: pawnFill }], radius: pawnRadius });
    const board = node(
      "liveBoard",
      Container({ layout: "story.flip.board" }),
      Bounded({ bounds: rect(boardW, boardH) }),
      Surfaced({ surface: "story.flip.oak" }),
      Flippable({ flip: "mirror", turns }),
    );
    add(
      board,
      node(
        "livePawn",
        Bounded({ bounds: rect(pawnW, pawnH) }),
        Surfaced({ surface: "story.flip.pawn" }),
        Transformable({ at: { x: driftX, y: driftY } }),
      ),
    );
    return scene(board).el;
  },
  args: {
    boardW: 4,
    boardH: 3,
    oakFill: "panelBg",
    oakRadius: 0.04,
    pawnW: 0.6,
    pawnH: 0.6,
    pawnFill: "accent",
    pawnRadius: 0.3,
    driftX: 1.2,
    driftY: 0.5,
    turns: 1,
  },
  argTypes: {
    boardW: sizeControl("board/bounds", "arg.w"),
    boardH: sizeControl("board/bounds", "arg.h"),
    oakFill: fillControl("board/surface"),
    oakRadius: radiusControl("board/surface"),
    turns: turnsControl("board/flippable"),
    pawnW: sizeControl("pawn/bounds", "arg.w"),
    pawnH: sizeControl("pawn/bounds", "arg.h"),
    pawnFill: fillControl("pawn/surface"),
    pawnRadius: radiusControl("pawn/surface"),
    // The live pose the mirror lands on — nothing is stored, so this is the state that turns.
    driftX: documented("arg.driftX", { control: { type: "range", min: -1.6, max: 1.6, step: 0.1 } }, "pawn/transformable"),
    driftY: documented("arg.driftY", { control: { type: "range", min: -1.2, max: 1.2, step: 0.1 } }, "pawn/transformable"),
  },
  parameters: { gkDocStory: "flippable.movethenflip" },
};

// ---- Row: the geometric mirror against the readable direction-flip --------------------------

/** Every number one row of tiles is drawn from — the tile, its dot, and the space between them. */
interface RowSpec {
  readonly gap: number;
  readonly tileW: number;
  readonly tileH: number;
  readonly tiles: readonly string[];
  readonly tileRadius: number;
  readonly dotW: number;
  readonly dotH: number;
  readonly dotFill: string;
  readonly dotRadius: number;
  readonly dotX: number;
  readonly dotY: number;
}

/** A row of tiles, each with a corner dot — the asymmetry that tells a mirror from a reorder. */
function letterRow(id: string, flip: string, turns: number, spec: RowSpec) {
  registerLayout("story.flip.letters", rowLayout({ gap: spec.gap }));
  registerLayout("story.flip.glyph", freeLayout);
  registerSurface("story.flip.dot", { layers: [{ paint: spec.dotFill }], radius: spec.dotRadius });
  const row = node(id, Container({ layout: "story.flip.letters" }), Flippable({ flip, turns }));
  for (const [i, paint] of spec.tiles.entries()) {
    registerSurface(`story.flip.letter.${i}`, { layers: [{ paint }], radius: spec.tileRadius });
    const tile = node(
      `${id}.tile#${i}`,
      Container({ layout: "story.flip.glyph" }),
      Bounded({ bounds: rect(spec.tileW, spec.tileH) }),
      Surfaced({ surface: `story.flip.letter.${i}` }),
    );
    add(
      tile,
      node(
        `${id}.dot#${i}`,
        Bounded({ bounds: rect(spec.dotW, spec.dotH) }),
        Surfaced({ surface: "story.flip.dot" }),
        Transformable({ at: { x: spec.dotX, y: spec.dotY } }),
      ),
    );
    add(row, tile);
  }
  return row;
}

/** The three tints are three rows on the panel, so the list itself is not an argument. */
interface RowArgs extends Omit<RowSpec, "tiles"> {
  boardGap: number;
  tile0: string;
  tile1: string;
  tile2: string;
  turns: number;
}

export const Row: StoryObj<RowArgs> = {
  // The same row twice, one turn. Above, `mirror`: the tiles come back reversed AND each is
  // reflected — the corner dots jump sides, the way glyphs would. Below, `directionFlip`: the
  // order reverses and nothing mirrors, so the dots stay put and a word would stay readable. The
  // trade is real — a mirror keeps hand-moved offsets turning (case D), the direction flip loses
  // them — and the NODE picks, by naming its recipe.
  render: ({ boardGap, tile0, tile1, tile2, turns, ...row }) => {
    registerLayout("story.flip.rows", rowLayout({ gap: boardGap, direction: "column" }));
    const board = node("rowBoard", Container({ layout: "story.flip.rows" }));
    const spec: RowSpec = { ...row, tiles: [tile0, tile1, tile2] };
    add(board, letterRow("mirrorRow", "mirror", turns, spec));
    add(board, letterRow("readableRow", "directionFlip", turns, spec));
    return scene(board).el;
  },
  args: {
    boardGap: 0.6,
    gap: 0.2,
    tileW: 0.8,
    tileH: 1.1,
    tile0: "accent",
    tile1: "textMuted",
    tile2: "panelBg",
    tileRadius: 0.06,
    dotW: 0.16,
    dotH: 0.16,
    dotFill: "alert",
    dotRadius: 0.5,
    dotX: 0.24,
    dotY: -0.36,
    turns: 1,
  },
  argTypes: {
    boardGap: gapControl("rowBoard/layout"),
    gap: gapControl("rows/layout"),
    turns: turnsControl("rows/flippable"),
    tileW: sizeControl("tiles/bounds", "arg.w"),
    tileH: sizeControl("tiles/bounds", "arg.h"),
    tile0: fillControl("tiles/surface"),
    tile1: fillControl("tiles/surface"),
    tile2: fillControl("tiles/surface"),
    tileRadius: radiusControl("tiles/surface"),
    dotW: sizeControl("dots/bounds", "arg.w"),
    dotH: sizeControl("dots/bounds", "arg.h"),
    dotFill: fillControl("dots/surface"),
    dotRadius: radiusControl("dots/surface"),
    // The corner the dot sits in: it is what jumps sides under a mirror and holds still under
    // the direction flip.
    dotX: placeControl("dots/transformable", "arg.x"),
    dotY: placeControl("dots/transformable", "arg.y"),
  },
  parameters: { gkDocStory: "flippable.row" },
};

// ---- EmptyBack: a turn never blanks the card ------------------------------------------------

interface EmptyBackArgs {
  w: number;
  h: number;
  fill: string;
  radius: number;
  turns: number;
}

export const EmptyBack: StoryObj<EmptyBackArgs> = {
  // A `turnOver` card whose `back` is empty: the turn falls through to the front — mirrored, since
  // the geometry still happens — and never a blank. A token identical on both sides needs no back,
  // and a half-built card stays visible while its art is on the way.
  render: ({ w, h, fill, radius, turns }) => {
    registerSurface("story.flip.front", { layers: [{ paint: fill }], radius });
    return scene(
      node(
        "tokenCard",
        Bounded({ bounds: rect(w, h) }),
        Surfaced({ surface: "story.flip.front" }),
        Flippable({ flip: "turnOver", back: "", turns }),
      ),
    ).el;
  },
  args: { w: 1, h: 1.4, fill: "panelBg", radius: 0.08, turns: 1 },
  argTypes: {
    w: sizeControl("card/bounds", "arg.w"),
    h: sizeControl("card/bounds", "arg.h"),
    fill: fillControl("card/surface"),
    radius: radiusControl("card/surface"),
    turns: turnsControl("card/flippable"),
  },
  parameters: { gkDocStory: "flippable.emptyback" },
};
