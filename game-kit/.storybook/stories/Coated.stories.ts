import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  coatNames,
  Coated,
  Container,
  installStockCoats,
  node,
  rect,
  registerLayout,
  rowLayout,
  Surfaced,
  surfaceNames,
  type Coat as CoatData,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// COATED is the runtime layer over a surface — the part `Surfaced`'s static record cannot hold: a
// magnitude that creeps, a reach that cascades, a colour there are infinitely many of, a mask. The
// atom holds only DATA (a recipe name, a `level`, a `tint`); what it LOOKS like is a recipe in the
// registry, and its REACH is the field's inheritance class — `self` this face, `cast` the subtree.
// The scenes here are the four cases that broke the record: a creeping value (`Coat`), a cascade and
// its inversion (`Cascade`), the infinite palette (`Team`), an animated mask (`Censor`).
//
// The recipes are installed here, as an ordinary consumer would — the catalog is one.
installStockCoats();

const RECIPES = ["", ...coatNames()];
const SURFACES = surfaceNames();

/** The controls of one coat, prefixed so two can sit on one panel — the mirror of the record's. */
function coatArgTypes(prefix: string, section: string): Record<string, unknown> {
  const at = (name: string): string => `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}`;
  // An empty recipe IS no coat, so a magnitude and a colour have nothing left to describe.
  const worn = { if: { arg: at("recipe"), neq: "" } };
  return {
    [at("recipe")]: documented("arg.coatRecipe", { control: "select", options: RECIPES }, section),
    [at("level")]: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 }, ...worn }, section),
    [at("tint")]: documented("arg.coatTint", { control: "select", options: ["", ...PAINTS], ...worn }, section),
  };
}

/** One coat, built from three named values — empty `tint` leaves the recipe its own colour. */
function coat(recipe: string, level: number, tint: string): CoatData {
  return { recipe, level, tint };
}

/** A registered surface, by name — the same picker for every node that names one. */
function surfaceControl(section: string): Record<string, unknown> {
  return documented("arg.surfaceName", { control: "select", options: SURFACES }, section);
}

/** A box in units. Sizes are stated, not dragged near — hence a number and not a range. */
function sizeControl(section: string, key: "arg.w" | "arg.h"): Record<string, unknown> {
  return documented(key, { control: { type: "number", min: 0, step: 0.1 } }, section);
}

/** Space between neighbours in a row — a parameter of the layout record, not of the node. */
function gapControl(section: string): Record<string, unknown> {
  return documented("arg.gap", { control: { type: "number", min: 0, step: 0.05 } }, section);
}

const meta: Meta = {
  title: "Atoms/Coated",
  parameters: {
    gkDoc: "coated.component",
    gkAtom: "Coated",
    // Which scenes teach which field, checked against the atom by `guard.every-field-has-a-control`.
    // `self` is exercised by the shard, the team and the censor; `cast` by the shard and the tray.
    gkFields: {
      self: ["Coat", "Team", "Censor", "Bluff"],
      cast: ["Coat", "Cascade"],
    },
  },
};
export default meta;

// ---- Coat: one node, both coats -------------------------------------------------------------

interface CoatArgs {
  id: string;
  w: number;
  h: number;
  surface: string;
  selfRecipe: string;
  selfLevel: number;
  selfTint: string;
  castRecipe: string;
  castLevel: number;
  castTint: string;
}

export const Coat: StoryObj<CoatArgs> = {
  // ONE NODE wearing both coats. `self` is on this face only; `cast` would fall to children too —
  // on a lone node it lands on itself, so both are visible here. Drag `selfLevel` and the wash
  // creeps; pick `ring` for `selfRecipe` and it becomes a border thickening with the number. There
  // is no scene per value: the magnitude is the parameter.
  render: ({ id, w, h, surface, selfRecipe, selfLevel, selfTint, castRecipe, castLevel, castTint }) => {
    const shard = node(
      id.trim() || "manaShard",
      Bounded({ bounds: rect(w, h) }),
      Surfaced({ surface }),
      Coated({ self: coat(selfRecipe, selfLevel, selfTint), cast: coat(castRecipe, castLevel, castTint) }),
    );
    return scene(shard).el;
  },
  args: {
    id: "manaShard",
    w: 1.4,
    h: 1.4,
    surface: "plate",
    selfRecipe: "wash",
    selfLevel: 0.55,
    selfTint: "accent",
    castRecipe: "",
    castLevel: 0.5,
    castTint: "",
  },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "shard"),
    w: sizeControl("shard/bounds", "arg.w"),
    h: sizeControl("shard/bounds", "arg.h"),
    surface: surfaceControl("shard/surface"),
    ...coatArgTypes("self", "shard/self"),
    ...coatArgTypes("cast", "shard/cast"),
  },
  parameters: { gkDocStory: "coated.coat" },
};

// ---- Cascade: the reach, and its inversion --------------------------------------------------

interface CascadeArgs {
  gap: number;
  traySurface: string;
  castRecipe: string;
  castLevel: number;
  castTint: string;
  figureW: number;
  figureH: number;
  figureSurface: string;
  spotlight: boolean;
  litRecipe: string;
  litLevel: number;
  litTint: string;
}

export const Cascade: StoryObj<CascadeArgs> = {
  // A tray casts over the figures standing on it — `cast` is `fromOwner`, so the freeze greys the
  // children too, with no code walking anything. Turn on `spotlight` and one figure clears the cast
  // back to nothing: "all but this one" is a dim on the tray and a `clear` on the lit child, which
  // is exactly what overriding an inherited value means. No `if scope ===` anywhere.
  render: ({ gap, traySurface, castRecipe, castLevel, castTint, figureW, figureH, figureSurface, spotlight, litRecipe, litLevel, litTint }) => {
    registerLayout("story.coated.row", rowLayout({ gap }));
    const tray = node(
      "frozenTray",
      Container({ layout: "story.coated.row" }),
      Surfaced({ surface: traySurface }),
      Coated({ cast: coat(castRecipe, castLevel, castTint) }),
    );
    add(tray, node("dimFigure", Bounded({ bounds: rect(figureW, figureH) }), Surfaced({ surface: figureSurface })));
    // The lit figure overrides the inherited cast when the spotlight is on — `clear` takes it back
    // to nothing, which is the "all but one" inversion, straight out of overriding a `fromOwner`.
    const litAtoms = spotlight ? [Coated({ cast: coat(litRecipe, litLevel, litTint) })] : [];
    add(tray, node("litFigure", Bounded({ bounds: rect(figureW, figureH) }), Surfaced({ surface: figureSurface }), ...litAtoms));
    return scene(tray).el;
  },
  args: {
    gap: 0.3,
    traySurface: "plate",
    castRecipe: "wash",
    castLevel: 0.6,
    castTint: "stageBg",
    figureW: 1,
    figureH: 1.4,
    figureSurface: "plate",
    spotlight: false,
    litRecipe: "clear",
    litLevel: 0,
    litTint: "",
  },
  argTypes: {
    gap: gapControl("tray/layout"),
    traySurface: surfaceControl("tray/surface"),
    ...coatArgTypes("cast", "tray/cast"),
    figureW: sizeControl("figures/bounds", "arg.w"),
    figureH: sizeControl("figures/bounds", "arg.h"),
    figureSurface: surfaceControl("figures/surface"),
    spotlight: documented("arg.spotlight", {}, "litFigure/cast"),
    // The override exists only while the spotlight is on: with it off the figure simply inherits.
    litRecipe: documented("arg.coatRecipe", { control: "select", options: RECIPES, if: { arg: "spotlight", truthy: true } }, "litFigure/cast"),
    litLevel: documented(
      "arg.coatLevel",
      { control: { type: "range", min: 0, max: 1, step: 0.05 }, if: { arg: "spotlight", truthy: true } },
      "litFigure/cast",
    ),
    litTint: documented(
      "arg.coatTint",
      { control: "select", options: ["", ...PAINTS], if: { arg: "spotlight", truthy: true } },
      "litFigure/cast",
    ),
  },
  parameters: { gkDocStory: "coated.cascade" },
};

// ---- Team: the infinite palette -------------------------------------------------------------

interface TeamArgs {
  gap: number;
  boardSurface: string;
  count: number;
  tileW: number;
  tileH: number;
  tileSurface: string;
  tileRecipe: string;
  tileLevel: number;
  tintToken: string;
}

export const Team: StoryObj<TeamArgs> = {
  // N runtime players, each tinting a tile its own hue — and the wire carries one recipe name and N
  // numbers, never N hexes and never N records. `spin` is the hue wheel; the parameter is the seat.
  // Drag `count` and the spectrum divides evenly, however many arrive.
  render: ({ gap, boardSurface, count, tileW, tileH, tileSurface, tileRecipe, tileLevel, tintToken }) => {
    registerLayout("story.coated.team", rowLayout({ gap }));
    const board = node("territory", Container({ layout: "story.coated.team" }), Surfaced({ surface: boardSurface }));
    const n = Math.max(1, Math.min(12, Math.round(count)));
    for (let i = 0; i < n; i += 1) {
      add(
        board,
        node(
          `territoryTile#${i}`,
          Bounded({ bounds: rect(tileW, tileH) }),
          Surfaced({ surface: tileSurface }),
          Coated({ self: { recipe: tileRecipe, level: tileLevel, tint: { token: tintToken, param: i / n } } }),
        ),
      );
    }
    return scene(board).el;
  },
  args: {
    gap: 0.2,
    boardSurface: "plate",
    count: 6,
    tileW: 0.9,
    tileH: 0.9,
    tileSurface: "plate",
    tileRecipe: "wash",
    tileLevel: 0.85,
    tintToken: "spin",
  },
  argTypes: {
    gap: gapControl("board/layout"),
    boardSurface: surfaceControl("board/surface"),
    count: documented("arg.count", { control: { type: "range", min: 1, max: 12, step: 1 } }, "tiles"),
    tileW: sizeControl("tiles/bounds", "arg.w"),
    tileH: sizeControl("tiles/bounds", "arg.h"),
    tileSurface: surfaceControl("tiles/surface"),
    tileRecipe: documented("arg.coatRecipe", { control: "select", options: RECIPES }, "tiles/self"),
    tileLevel: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "tiles/self"),
    // The token is a NAME the painter resolves; the seat is its number. A name nobody registered
    // falls back to the accent, so a typo is a colour, not a crash.
    tintToken: documented("arg.tintToken", { control: "text" }, "tiles/self"),
  },
  parameters: { gkDocStory: "coated.team" },
};

// ---- Censor: the animated mask --------------------------------------------------------------

interface CensorArgs {
  w: number;
  h: number;
  surface: string;
  recipe: string;
  level: number;
}

export const Censor: StoryObj<CensorArgs> = {
  // The censorship case: a mask over the surface. The wash guarantees a visible bar with no GPU at
  // all; on the glass a named `blur` filter animates over it, clocked by the painter. The atom holds
  // the static truth (`censor`, a strength); the animation is the render tier's, where the live
  // per-object transform already lives.
  render: ({ w, h, surface, recipe, level }) => {
    const card = node("hiddenTrap", Bounded({ bounds: rect(w, h) }), Surfaced({ surface }), Coated({ self: coat(recipe, level, "") }));
    return scene(card).el;
  },
  args: { w: 1.4, h: 2, surface: "plate", recipe: "censor", level: 0.7 },
  argTypes: {
    w: sizeControl("card/bounds", "arg.w"),
    h: sizeControl("card/bounds", "arg.h"),
    surface: surfaceControl("card/surface"),
    recipe: documented("arg.coatRecipe", { control: "select", options: RECIPES }, "card/self"),
    level: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "card/self"),
  },
  parameters: { gkDocStory: "coated.censor" },
};

// ---- Bluff: privacy is a projected field, not a viewer flag ---------------------------------

interface BluffArgs {
  gap: number;
  w: number;
  h: number;
  surface: string;
  recipe: string;
  level: number;
  tint: string;
}

export const Bluff: StoryObj<BluffArgs> = {
  // TWO TREES side by side — the same card as two clients hold it. The bluffer's tree carries the
  // tell (a `self` coat); the opponent's tree simply DOES NOT HAVE the field, because the
  // orchestrator omitted it from that projection. No recipe here reads a viewer: privacy is what a
  // tree does not contain, never a flag the paint checks (`guard.coat-not-viewer`).
  render: ({ gap, w, h, surface, recipe, level, tint }) => {
    registerLayout("story.coated.bluff", rowLayout({ gap }));
    const desk = node("bluffDesk", Container({ layout: "story.coated.bluff" }));
    const card = (id: string, withTell: boolean) =>
      node(id, Bounded({ bounds: rect(w, h) }), Surfaced({ surface }), ...(withTell ? [Coated({ self: coat(recipe, level, tint) })] : []));
    add(desk, card("yourCard", true));
    add(desk, card("theirCard", false));
    return scene(desk).el;
  },
  args: { gap: 1, w: 1.2, h: 1.7, surface: "plate", recipe: "ring", level: 0.8, tint: "accent" },
  argTypes: {
    gap: gapControl("desk/layout"),
    w: sizeControl("cards/bounds", "arg.w"),
    h: sizeControl("cards/bounds", "arg.h"),
    surface: surfaceControl("cards/surface"),
    // The tell is on YOUR card alone — the other tree simply does not carry the field.
    recipe: documented("arg.coatRecipe", { control: "select", options: RECIPES }, "yourCard/self"),
    level: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "yourCard/self"),
    tint: documented("arg.coatTint", { control: "select", options: ["", ...PAINTS] }, "yourCard/self"),
  },
  parameters: { gkDocStory: "coated.bluff" },
};
