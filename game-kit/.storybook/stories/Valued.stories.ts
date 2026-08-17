import type { Meta, StoryObj } from "@storybook/html";
import {
  Acceptor,
  add,
  Bounded,
  Container,
  Draggable,
  freeLayout,
  installStockCarries,
  installStockCoats,
  Inviting,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  Valued,
} from "../../src/index.js";
import { wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// VALUED is the element's own game data, as plain fields: a rank, a suit, a cost — whatever a
// RULE will read. The atom stores and never interprets; the reader is the rule language
// (`el.values.rank` in an Acceptor), sorting, scoring. That is why this scene needs no second
// mechanism to make the data visible: set the card's rank and watch the sevens zone change its
// verdict — through the same invite every willing zone already wears.
installStockCoats();
installStockCarries();

const meta: Meta = {
  title: "Atoms/Valued",
  parameters: {
    gkDoc: "valued.component",
    gkAtom: "Valued",
    gkFields: { values: ["Rank"] },
  },
};
export default meta;

interface RankArgs {
  rank: number;
}

export const Rank: StoryObj<RankArgs> = {
  // ONE CARD, ONE NUMBER. The zone takes rank 7 and nothing else; `rank` writes the card's
  // `values`. Drag the card at it: at 7 the zone lights, at anything else it stays dark — the
  // rule reads `el.values.rank` off this very atom, and no other code path knows what a rank is.
  render: (a) => {
    registerSurface("story.valued.zone", { layers: [{ paint: "sunkBg" }], radius: 0.12 });
    registerSurface("story.valued.card", { layers: [{ paint: "accent" }], radius: 0.08 });
    registerLayout("story.valued.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.valued.free" }));
    add(
      desk,
      node(
        "sevenZone",
        Bounded({ bounds: rect(1.5, 1.9) }),
        Container({ layout: "story.valued.free" }),
        Surfaced({ surface: "story.valued.zone" }),
        Transformable({ at: { x: 1.2, y: 0 } }),
        Acceptor({ accept: { eq: ["el.values.rank", 7] } }),
        Inviting({ coat: { recipe: "wash", level: 0.4, tint: "accent" } }),
      ),
    );
    add(
      desk,
      node(
        "card",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.valued.card" }),
        Transformable({ at: { x: -1.4, y: 0 } }),
        Valued({ values: { rank: a.rank } }),
        Draggable(),
      ),
    );
    return wireDrag(scene(desk, { animate: true })).el;
  },
  args: { rank: 7 },
  argTypes: {
    rank: documented("arg.rank", { control: { type: "range", min: 1, max: 13, step: 1 } }, "values"),
  },
  parameters: { gkDocStory: "valued.rank" },
};
