import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  Flippable,
  installStockFlips,
  node,
  rect,
  registerLayout,
  registerSurface,
  rowLayout,
  Surfaced,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// PRESETS THAT TURN A NODE OVER — one page per stock flip recipe, in isolation.
//
// `Atoms/Flippable` teaches the atom and case A; this shelf answers "what does `mirror` / `turnOver`
// already do, and how do I configure it". `mirror` is pure geometry, so it wants a subject that SHOWS
// a reflection — a row of distinct tiles, which comes back reversed. `turnOver` is the card: a front
// and a back, swapped by the same turn.
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
