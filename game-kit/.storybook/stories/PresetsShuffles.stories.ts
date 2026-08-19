// PRESETS / SHUFFLES — the recipes a reorder can LOOK like, one shelf, in isolation, drop-in.
//
// `Engine/Motion` teaches the shuffle as a motion; this shelf answers the narrower question a
// gamedev has — "what does this NAME already do". Four recipes, shown on a row of plain TOKENS
// rather than cards, because a recipe is entity-agnostic: children by index, cards or tiles or
// dice, and a fan of a hand is the cards preset's business. The order the row lands in is the
// seed's (the truth); the recipe never sees the seed and the seed never sees the recipe — swap
// either and the other does not notice.

import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  byId,
  Container,
  DEFAULT_TUNING,
  freeLayout,
  installStockShuffles,
  node,
  overhand,
  permutation,
  rect,
  registerLayout,
  registerShuffle,
  registerSurface,
  reorder,
  riffle,
  rowLayout,
  seededRng,
  shake,
  shuffleNames,
  Surfaced,
  Transformable,
  wash,
  type ShuffleRecipe,
} from "../../src/index.js";
import { scene, type Scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

installStockShuffles();

const meta: Meta = {
  title: "Presets/Shuffles",
  parameters: { gkDoc: "presetsShuffles.component" },
};
export default meta;

interface RecipeArgs {
  shuffled: number;
  seed: number;
  count: number;
  shuffleMs: number;
  /** `riffle`/`overhand` only — how far the packets go: clear of the group, or off the glass. */
  reach?: "group" | "glass";
  /** `wash` only — the ring's radius in units, `0` for the one that clears the group. */
  radius?: number;
  /** `shake` only — how hard, `1` being the stock tremble. */
  strength?: number;
}

/**
 * A recipe that takes options is BUILT from the panel and registered under its own name — the same
 * two lines a game writes to keep a wider wash or a harder shake of its own. The stock name is left
 * exactly as `installStockShuffles` left it.
 */
interface Tunable {
  readonly args: Partial<RecipeArgs>;
  readonly argTypes: Record<string, unknown>;
  readonly make: (a: RecipeArgs) => ShuffleRecipe;
}

const shuffledControl = documented("arg.shuffled", { control: { type: "number", min: 0, step: 1 } }, "motion");
const seedControl = documented("arg.seed", { control: { type: "number", step: 1 } }, "shuffle");
const countControl = documented("arg.count", { control: { type: "range", min: 2, max: 12, step: 1 } }, "shuffle");
const shuffleMsControl = documented("arg.shuffleMs", { control: { type: "range", min: 100, max: 3000, step: 50 } }, "shuffle");
const radiusControl = documented("arg.washRadius", { control: { type: "range", min: 0, max: 8, step: 0.1 } }, "recipe");
const strengthControl = documented("arg.shakeStrength", { control: { type: "range", min: 0, max: 4, step: 0.25 } }, "recipe");

const reachControl = documented("arg.reach", { control: "inline-radio", options: ["group", "glass"] }, "recipe");

const TUNED: Record<string, Tunable> = {
  riffle: {
    args: { reach: "group" },
    argTypes: { reach: reachControl },
    make: (a) => riffle({ reach: a.reach ?? "group" }),
  },
  overhand: {
    args: { reach: "group" },
    argTypes: { reach: reachControl },
    make: (a) => overhand({ reach: a.reach ?? "group" }),
  },
  wash: {
    args: { radius: 0 },
    argTypes: { radius: radiusControl },
    make: (a) => wash({ radius: a.radius ?? 0 }),
  },
  shake: {
    args: { strength: 1 },
    argTypes: { strength: strengthControl },
    make: (a) => shake({ strength: a.strength ?? 1 }),
  },
};

/** What each standing scene last saw: the trigger, how many taps it has had, and the order it stands in. */
const LAST = new WeakMap<HTMLElement, { shuffled?: number; taps: number; order?: readonly number[] }>();
const LIVE_EL = new Map<string, HTMLElement>();
/** What a tap on each shelf does RIGHT NOW — the newest render's shuffle, by recipe name. */
const TAP = new Map<string, () => void>();

const PAINTS = ["accent", "alert", "textMuted", "panelBg", "sunkBg", "panelBorder"] as const;

/**
 * One recipe on a row of `count` tokens. TAP ANY TOKEN and the row shuffles again; the panel's
 * `shuffled` does the same for a reader who is already there. The order is whatever
 * `seed + shuffled + taps` draws, so every shuffle lands somewhere new. The scene stands between
 * renders and remembers the order it landed in, so a slider move does not silently un-shuffle it.
 */
function shelf(recipe: string): StoryObj<RecipeArgs> {
  const tuned = TUNED[recipe];
  return {
    // Only the knobs this recipe actually reads reach the panel — a shake offering a ring radius
    // would be teaching a field it does not have.
    args: { shuffled: 0, seed: 7, count: 6, shuffleMs: DEFAULT_TUNING.shuffleMs, ...tuned?.args },
    argTypes: {
      shuffled: shuffledControl,
      seed: seedControl,
      count: countControl,
      shuffleMs: shuffleMsControl,
      ...tuned?.argTypes,
    },
    parameters: { gkDocStory: `presetsShuffles.${recipe}` },
    render: (a) => {
      registerLayout("preset.shuffle.free", freeLayout);
      registerLayout("preset.shuffle.row", rowLayout({ gap: 0.2 }));
      PAINTS.forEach((paint, i) => registerSurface(`preset.shuffle.${i}`, { layers: [{ paint }], radius: 0.5 }));
      const desk = node("desk", Container({ layout: "preset.shuffle.free" }));
      const row = node("row", Container({ layout: "preset.shuffle.row" }), Transformable({ at: { x: 0, y: 0 } }));
      add(desk, row);
      for (let i = 0; i < a.count; i++) {
        add(row, node(`t${i}`, Bounded({ bounds: rect(0.8, 0.8) }), Surfaced({ surface: `preset.shuffle.${i % PAINTS.length}` })));
      }
      const el = LIVE_EL.get(recipe);
      const seen = el ? LAST.get(el) : undefined;
      if (seen?.order && seen.order.length === a.count) reorder(row, seen.order);
      // The tap is wired ONCE, with the scene, and calls whatever this render left behind — the
      // shell keeps the handler, so the newest args are the ones a tap shuffles by.
      const s: Scene = scene(desk, {
        animate: true,
        motion: { shuffleMs: a.shuffleMs },
        tap: (hit) => {
          if (hit) TAP.get(recipe)?.();
        },
      });
      LIVE_EL.set(recipe, s.el);
      const before = LAST.get(s.el) ?? { taps: 0 };
      const fired = before.shuffled !== undefined && before.shuffled !== a.shuffled;
      const standing = before.order && before.order.length === a.count ? before.order : Array.from({ length: a.count }, (_, i) => i);
      LAST.set(s.el, { shuffled: a.shuffled, taps: before.taps, order: standing });
      // A tuned recipe is rebuilt from the panel every render and registered under a name of this
      // story's own, so the NEXT shuffle plays the numbers now on the panel.
      const name = tuned ? `story.shuffle.${recipe}` : recipe;
      if (tuned) registerShuffle(name, tuned.make(a));
      /** Shuffle the row again, from wherever it stands, to what the next draw gives. */
      const fire = (): void => {
        const live = byId(s.host.root, "row");
        const was = LAST.get(s.el);
        if (!live || !was?.order) return;
        const order = permutation(a.count, seededRng(a.seed + a.shuffled + was.taps));
        LAST.set(s.el, { ...was, order: order.map((i) => was.order![i]!) });
        s.motions?.shuffle("row", () => reorder(live, order), { recipe: name });
      };
      TAP.set(recipe, () => {
        const was = LAST.get(s.el);
        if (was) LAST.set(s.el, { ...was, taps: was.taps + 1 });
        fire();
      });
      if (fired) fire();
      return s.el;
    },
  };
}

// The names are the registry's — `shuffleNames()` — and the shelf has one story per stock name.
const [RIFFLE, OVERHAND, WASH, SHAKE] = ["riffle", "overhand", "wash", "shake"];
if (shuffleNames().join(",") !== [RIFFLE, OVERHAND, WASH, SHAKE].join(",")) {
  // Loud in the console rather than a silent shelf with a missing recipe.
  console.warn(`Presets/Shuffles: stock names are ${shuffleNames().join(", ")}`);
}

/** The pack splits into two halves that part and fan, then zip back together, halves alternating. */
export const Riffle = shelf(RIFFLE!);
/** Three packets pulled straight up in turn, carried across to the drop, let fall onto new seats. */
export const Overhand = shelf(OVERHAND!);
/** Every piece scatters to a ring around the group, turning, and gathers back — the tiles shuffle. */
export const Wash = shelf(WASH!);
/** The group trembles, throwing its pieces onto each other's seats until it lands — dice in a cup. */
export const Shake = shelf(SHAKE!);
