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

/** The controls of one coat, prefixed so two can sit on one panel — the mirror of the record's. */
function coatArgTypes(prefix: string, section: string): Record<string, unknown> {
  const at = (name: string): string => `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}`;
  return {
    [at("recipe")]: documented("arg.coatRecipe", { control: "select", options: RECIPES }, section),
    [at("level")]: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, section),
    [at("tint")]: documented("arg.coatTint", { control: "select", options: ["", ...PAINTS] }, section),
  };
}

/** Read a coat off a prefixed slice of the args. */
function coatOf(a: Record<string, unknown>, prefix: string): CoatData {
  const at = (name: string): string => `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}`;
  return {
    recipe: String(a[at("recipe")] ?? ""),
    level: Number(a[at("level")] ?? 0),
    tint: String(a[at("tint")] ?? ""),
  };
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
  render: (a) => {
    const shard = node(
      a.id.trim() || "manaShard",
      Bounded({ bounds: rect(1.4, 1.4) }),
      Surfaced({ surface: "plate" }),
      Coated({ self: coatOf(a as unknown as Record<string, unknown>, "self"), cast: coatOf(a as unknown as Record<string, unknown>, "cast") }),
    );
    return scene(shard).el;
  },
  args: {
    id: "manaShard",
    selfRecipe: "wash",
    selfLevel: 0.55,
    selfTint: "accent",
    castRecipe: "",
    castLevel: 0.5,
    castTint: "",
  },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    ...coatArgTypes("self", "self"),
    ...coatArgTypes("cast", "cast"),
  },
  parameters: { gkDocStory: "coated.coat" },
};

// ---- Cascade: the reach, and its inversion --------------------------------------------------

interface CascadeArgs {
  castRecipe: string;
  castLevel: number;
  castTint: string;
  spotlight: boolean;
}

export const Cascade: StoryObj<CascadeArgs> = {
  // A tray casts over the figures standing on it — `cast` is `fromOwner`, so the freeze greys the
  // children too, with no code walking anything. Turn on `spotlight` and one figure clears the cast
  // back to nothing: "all but this one" is a dim on the tray and a `clear` on the lit child, which
  // is exactly what overriding an inherited value means. No `if scope ===` anywhere.
  render: (a) => {
    registerLayout("story.coated.row", rowLayout({ gap: 0.3 }));
    const tray = node(
      "frozenTray",
      Container({ layout: "story.coated.row" }),
      Surfaced({ surface: "plate" }),
      Coated({ cast: coatOf(a as unknown as Record<string, unknown>, "cast") }),
    );
    add(tray, node("dimFigure", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "plate" })));
    // The lit figure clears the inherited cast back to nothing when the spotlight is on — the
    // "all but one" inversion, straight out of overriding a `fromOwner` value.
    const litAtoms = a.spotlight ? [Coated({ cast: { recipe: "clear", level: 0, tint: "" } })] : [];
    add(tray, node("litFigure", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "plate" }), ...litAtoms));
    return scene(tray).el;
  },
  args: { castRecipe: "wash", castLevel: 0.6, castTint: "stageBg", spotlight: false },
  argTypes: {
    ...coatArgTypes("cast", "cast"),
    spotlight: documented("arg.spotlight", {}, "cast"),
  },
  parameters: { gkDocStory: "coated.cascade" },
};

// ---- Team: the infinite palette -------------------------------------------------------------

interface TeamArgs {
  count: number;
}

export const Team: StoryObj<TeamArgs> = {
  // N runtime players, each tinting a tile its own hue — and the wire carries one recipe name and N
  // numbers, never N hexes and never N records. `spin` is the hue wheel; the parameter is the seat.
  // Drag `count` and the spectrum divides evenly, however many arrive.
  render: (a) => {
    registerLayout("story.coated.team", rowLayout({ gap: 0.2 }));
    const board = node("territory", Container({ layout: "story.coated.team" }), Surfaced({ surface: "plate" }));
    const n = Math.max(1, Math.min(12, Math.round(a.count)));
    for (let i = 0; i < n; i += 1) {
      add(
        board,
        node(
          `territoryTile#${i}`,
          Bounded({ bounds: rect(0.9, 0.9) }),
          Surfaced({ surface: "plate" }),
          Coated({ self: { recipe: "wash", level: 0.85, tint: { token: "spin", param: i / n } } }),
        ),
      );
    }
    return scene(board).el;
  },
  args: { count: 6 },
  argTypes: {
    count: documented("arg.count", { control: { type: "range", min: 1, max: 12, step: 1 } }, "container"),
  },
  parameters: { gkDocStory: "coated.team" },
};

// ---- Censor: the animated mask --------------------------------------------------------------

interface CensorArgs {
  level: number;
}

export const Censor: StoryObj<CensorArgs> = {
  // The censorship case: a mask over the surface. The wash guarantees a visible bar with no GPU at
  // all; on the glass a named `blur` filter animates over it, clocked by the painter. The atom holds
  // the static truth (`censor`, a strength); the animation is the render tier's, where the live
  // per-object transform already lives.
  render: (a) => {
    const card = node(
      "hiddenTrap",
      Bounded({ bounds: rect(1.4, 2) }),
      Surfaced({ surface: "plate" }),
      Coated({ self: { recipe: "censor", level: a.level, tint: "" } }),
    );
    return scene(card).el;
  },
  args: { level: 0.7 },
  argTypes: {
    level: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "self"),
  },
  parameters: { gkDocStory: "coated.censor" },
};

// ---- Bluff: privacy is a projected field, not a viewer flag ---------------------------------

interface BluffArgs {
  level: number;
  tint: string;
}

export const Bluff: StoryObj<BluffArgs> = {
  // TWO TREES side by side — the same card as two clients hold it. The bluffer's tree carries the
  // tell (a `self` coat); the opponent's tree simply DOES NOT HAVE the field, because the
  // orchestrator omitted it from that projection. No recipe here reads a viewer: privacy is what a
  // tree does not contain, never a flag the paint checks (`guard.coat-not-viewer`).
  render: (a) => {
    registerLayout("story.coated.bluff", rowLayout({ gap: 1 }));
    const desk = node("bluffDesk", Container({ layout: "story.coated.bluff" }));
    const card = (id: string, withTell: boolean) =>
      node(
        id,
        Bounded({ bounds: rect(1.2, 1.7) }),
        Surfaced({ surface: "plate" }),
        ...(withTell ? [Coated({ self: { recipe: "ring", level: a.level, tint: a.tint } })] : []),
      );
    add(desk, card("yourCard", true));
    add(desk, card("theirCard", false));
    return scene(desk).el;
  },
  args: { level: 0.8, tint: "accent" },
  argTypes: {
    level: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "self"),
    tint: documented("arg.coatTint", { control: "select", options: ["", ...PAINTS] }, "self"),
  },
  parameters: { gkDocStory: "coated.bluff" },
};
