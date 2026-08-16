import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  byId,
  Container,
  Draggable,
  freeLayout,
  grabFrom,
  installStockCarries,
  installStockGrabs,
  Lit,
  node,
  pile,
  rect,
  registerLayout,
  registerSurface,
  stackLayout,
  Surfaced,
  type Node,
} from "../../src/index.js";
import { runBelow, wireDrag } from "../devtools/drag.js";
import { scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

// A PILE IS ONE LITERAL OF DATA. Every game keeps stacks — a stock of cards, a tableau column, a
// poker bank of chips, captured chess pieces, monopoly houses — and `pile()` is the assembly they
// all share: a seat, a box, a face, an arrangement by registry name, and the four policies (grab ·
// accept · invite · shadow), each present only when its data is. The three piles here differ ONLY
// in their literals; there is no squared-pile class and no column class anywhere.
installStockGrabs();
installStockCarries();

const meta: Meta = {
  title: "Presets/Piles",
  parameters: { gkDoc: "presetsPiles.component" },
};
export default meta;

/** The run the touched pile's own Grabber answers — the demo drags BY the pile's policy. */
function grabRun(root: Node, hit: Node): readonly Node[] {
  const holder = hit.parent;
  if (!holder) return [hit];
  const ids = grabFrom(holder, hit.id);
  if (ids.length === 0) return runBelow(root, hit);
  return ids.map((id) => byId(root, id)).filter((n): n is Node => !!n);
}

interface PilesArgs {
  count: number;
}

export const Piles: StoryObj<PilesArgs> = {
  // Three piles, three literals. The squared stock answers a touch with its TOP card (`grab:
  // "top"`), the column lifts the touched card and everything above it (`"above"`), the fan
  // gives exactly the card under the finger (`"one"`). Drag off any of them: each pile lays ONE
  // shadow for everything it holds, and a lifted card starts casting its own the moment it
  // stands alone on the desk.
  render: (a) => {
    registerLayout("story.pile.free", freeLayout);
    registerLayout("story.pile.squared", stackLayout({ offset: { x: 0.014, y: 0.014 } }));
    registerLayout("story.pile.column", stackLayout({ offset: { x: 0, y: 0.34 } }));
    registerLayout("story.pile.fan", stackLayout({ offset: { x: 0.4, y: 0 } }));
    registerSurface("story.pile.slot", { layers: [{ paint: "sunkBg" }], radius: 0.1 });
    for (const [name, paint] of [["a", "accent"], ["b", "panelBg"], ["c", "textMuted"]] as const) {
      registerSurface(`story.pile.card.${name}`, { layers: [{ paint }], radius: 0.08 });
    }
    const desk = node("desk", Container({ layout: "story.pile.free" }), Lit());
    const specs = [
      { id: "stock", at: { x: -2.4, y: -0.6 }, layout: "story.pile.squared", grab: "top" },
      { id: "column", at: { x: 0, y: -1.4 }, layout: "story.pile.column", grab: "above" },
      { id: "fan", at: { x: 1.2, y: 1.2 }, layout: "story.pile.fan", grab: "one" },
    ];
    for (const s of specs) {
      const p = pile(s.id, {
        at: s.at,
        bounds: rect(1, 1.4),
        surface: "story.pile.slot",
        layout: s.layout,
        grab: s.grab,
        shadow: "silhouette",
      });
      for (let i = 0; i < a.count; i++) {
        add(
          p,
          node(
            `${s.id}.card#${i}`,
            Bounded({ bounds: rect(1, 1.4) }),
            Surfaced({ surface: `story.pile.card.${(["a", "b", "c"] as const)[i % 3]}` }),
            Draggable(),
          ),
        );
      }
      add(desk, p);
    }
    return wireDrag(scene(desk, { animate: true }), {
      lift: 1.06,
      tilt: { factor: 3, maxDeg: 15 },
      runOf: grabRun,
    }).el;
  },
  args: { count: 4 },
  argTypes: {
    count: documented("arg.count", { control: { type: "range", min: 1, max: 8, step: 1 } }, "pile"),
  },
  parameters: { gkDocStory: "presetsPiles.piles" },
};
