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
  permutation,
  rect,
  registerLayout,
  registerSurface,
  reorder,
  rowLayout,
  seededRng,
  shuffleNames,
  Surfaced,
  Transformable,
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
}

const shuffledControl = documented("arg.shuffled", { control: { type: "number", min: 0, step: 1 } }, "motion");
const seedControl = documented("arg.seed", { control: { type: "number", step: 1 } }, "shuffle");
const countControl = documented("arg.count", { control: { type: "range", min: 2, max: 12, step: 1 } }, "shuffle");
const shuffleMsControl = documented("arg.shuffleMs", { control: { type: "range", min: 100, max: 3000, step: 50 } }, "shuffle");

/** What each standing scene last saw: the trigger, and the order its row stands in. */
const LAST = new WeakMap<HTMLElement, { shuffled?: number; order?: readonly number[] }>();
const LIVE_EL = new Map<string, HTMLElement>();

const PAINTS = ["accent", "alert", "textMuted", "panelBg", "sunkBg", "panelBorder"] as const;

/**
 * One recipe on a row of `count` tokens. Bump `shuffled` and the row shuffles again — to the order
 * `seed + shuffled` draws — through this recipe. The scene stands between renders and remembers the
 * order it landed in, so a slider move does not silently un-shuffle it.
 */
function shelf(recipe: string): StoryObj<RecipeArgs> {
  return {
    args: { shuffled: 0, seed: 7, count: 6, shuffleMs: DEFAULT_TUNING.shuffleMs },
    argTypes: { shuffled: shuffledControl, seed: seedControl, count: countControl, shuffleMs: shuffleMsControl },
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
      const s: Scene = scene(desk, { animate: true, motion: { shuffleMs: a.shuffleMs } });
      LIVE_EL.set(recipe, s.el);
      const before = LAST.get(s.el) ?? {};
      const fired = before.shuffled !== undefined && before.shuffled !== a.shuffled;
      const standing = before.order && before.order.length === a.count ? before.order : Array.from({ length: a.count }, (_, i) => i);
      LAST.set(s.el, { shuffled: a.shuffled, order: standing });
      if (fired) {
        const live = byId(s.host.root, "row");
        if (live) {
          const order = permutation(a.count, seededRng(a.seed + a.shuffled));
          LAST.set(s.el, { shuffled: a.shuffled, order: order.map((i) => standing[i]!) });
          s.motions?.shuffle("row", () => reorder(live, order), { recipe });
        }
      }
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

/** The pack splits into two halves and zips back together, halves alternating. */
export const Riffle = shelf(RIFFLE!);
/** Packets lifted off the top in turn, dropped back onto the new seats. */
export const Overhand = shelf(OVERHAND!);
/** Every piece scatters to a ring around the group, turning, and gathers back — the tiles shuffle. */
export const Wash = shelf(WASH!);
/** The group trembles in place, dying out — dice in a cup, tiles in a bag. */
export const Shake = shelf(SHAKE!);
