import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
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
import { checks, imagesDiffer, painted, settled, snapshot, standing, type CheckContext } from "../devtools/checks.js";

// FLIPPABLE ON THE GLASS. The unit suite states the parity; this rung proves the engine's effect is
// WIRED — that a turn shows the back, that an even count returns the front, and that a stack turns
// the card standing on it. Front and back are two clearly different colours, so the swap is read off
// the pixels rather than asserted in the abstract.
installStockFlips();
registerSurface("tests.flip.front", { layers: [{ paint: "panelBg" }], radius: 0.08 });
registerSurface("tests.flip.back", { layers: [{ paint: "accent" }], radius: 0.08 });

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

/** A card resting at a given turn count. Even is face-up, odd shows the back. */
function card(turns: number) {
  return node(
    "aceCard",
    Bounded({ bounds: rect(1, 1.4) }),
    Surfaced({ surface: "tests.flip.front" }),
    Flippable({ flip: "turnOver", back: "tests.flip.back", turns }),
  );
}

/** A stack turned `turns` times, holding one face-up card — the summed parity is what shows. */
function stack(turns: number) {
  registerLayout("tests.flip.row", rowLayout({ gap: 0.2 }));
  const s = node("deckStack", Container({ layout: "tests.flip.row" }), Flippable({ turns }));
  add(s, node("heldCard", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "tests.flip.front" }), Flippable({ flip: "turnOver", back: "tests.flip.back", turns: 0 })));
  return s;
}

interface Args {
  id: string;
}

const meta: Meta<Args> = {
  title: "Tests/Flippable",
  parameters: { gkDoc: "tests.flippable" },
  argTypes: { id: { control: "text" } },
  args: { id: "aceCard" },
};
export default meta;

export const Play: StoryObj<Args> = {
  parameters: { gkDocStory: "tests.flippable.play", controls: { include: ["id"] } },
  render: () => scene(card(0)).el,
  play: checks([
    {
      name: "play.flippable.a-turn-shows-the-back — an odd count swaps the surface",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        live.setRoot(card(0));
        await settled();
        const front = snapshot(glass);
        live.setRoot(card(1));
        await settled();
        const back = snapshot(glass);
        await expect(imagesDiffer(front, back), "a turn shows the back surface").toBe(true);
        live.setRoot(card(0));
        await settled();
      },
    },
    {
      name: "play.flippable.re-flip-returns-the-front — an even count is face-up again",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        live.setRoot(card(0));
        await settled();
        const zero = snapshot(glass);
        live.setRoot(card(2));
        await settled();
        const twice = snapshot(glass);
        // Two turns is the authored state exactly — the side is a parity, not a stored flag.
        await expect(imagesDiffer(zero, twice), "twice turned is the front again").toBe(false);
        live.setRoot(card(0));
        await settled();
      },
    },
    {
      name: "play.flippable.a-stack-turns-its-child — turns sum along the chain",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        live.setRoot(stack(0));
        await settled();
        const rest = snapshot(glass);
        live.setRoot(stack(1));
        await settled();
        const turned = snapshot(glass);
        // The stack turned once, the card turned none: the child's summed parity is odd, so it shows
        // its back — no per-card bookkeeping.
        await expect(imagesDiffer(rest, turned), "the stack turns its child over").toBe(true);
        live.setRoot(stack(0));
        await settled();
      },
    },
  ]),
};
