import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  Bounded,
  Container,
  contentSwap,
  Flippable,
  freeLayout,
  installStockFlips,
  node,
  rect,
  registerFlip,
  registerLayout,
  registerSurface,
  rowLayout,
  Surfaced,
  Transformable,
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
    {
      name: "play.flippable.content-swap-shows-another-subtree — the back face is a whole other tree",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        // The board's back is registered BY THE CONSUMER: an iron face with its own child. The
        // engine draws the shown node's children, so the swap must change the picture — and the
        // front's child must not bleed through (the substitute has a different layout entirely).
        registerSurface("tests.flip.iron", { layers: [{ paint: "sunkBg" }], radius: 0.06 });
        const iron = node("ironFace", Container({ layout: "tests.flip.row" }), Bounded({ bounds: rect(3, 2) }), Surfaced({ surface: "tests.flip.iron" }));
        add(iron, node("ironGem", Bounded({ bounds: rect(0.5, 0.5) }), Surfaced({ surface: "tests.flip.back" })));
        registerFlip("tests.flip.ironBack", contentSwap(() => iron));
        const board = (turns: number) => {
          const b = node(
            "swapBoard",
            Container({ layout: "tests.flip.row" }),
            Bounded({ bounds: rect(3, 2) }),
            Surfaced({ surface: "tests.flip.front" }),
            Flippable({ flip: "tests.flip.ironBack", turns }),
          );
          add(b, node("frontCard", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "tests.flip.front" })));
          return b;
        };
        live.setRoot(board(0));
        await settled();
        const front = snapshot(glass);
        live.setRoot(board(1));
        await settled();
        const back = snapshot(glass);
        await expect(imagesDiffer(front, back), "the swap shows the other subtree").toBe(true);
        live.setRoot(card(0));
        await settled();
      },
    },
    {
      name: "play.flippable.move-then-flip-mirrors-the-live-state — the mirror lands on NOW",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        // Case D, as pixels: a symmetric board with a pawn moved to +x, then flipped, must paint
        // exactly what the unflipped board paints with the pawn at −x. The mirror composes over
        // the LIVE pose — nothing was stored, so the two scenes are the same picture.
        registerLayout("tests.flip.free", freeLayout);
        const board = (x: number, turns: number) => {
          const b = node(
            "liveBoard",
            Container({ layout: "tests.flip.free" }),
            Bounded({ bounds: rect(3, 2) }),
            Surfaced({ surface: "tests.flip.front" }),
            Flippable({ flip: "mirror", turns }),
          );
          add(b, node("livePawn", Bounded({ bounds: rect(0.5, 0.5) }), Surfaced({ surface: "tests.flip.back" }), Transformable({ at: { x, y: 0.4 } })));
          return b;
        };
        live.setRoot(board(0.9, 1));
        await settled();
        const flipped = snapshot(glass);
        live.setRoot(board(-0.9, 0));
        await settled();
        const mirroredByHand = snapshot(glass);
        // A loose threshold: mirrored rasterisation may not be bit-identical at the edges, and
        // the claim is about WHERE the pawn is — a wrong side moves whole-contrast pixels.
        await expect(imagesDiffer(flipped, mirroredByHand, 48), "the flip mirrors the live pose exactly").toBe(false);
        live.setRoot(card(0));
        await settled();
      },
    },
    {
      name: "play.flippable.params-change-on-the-fly — the same tree repaints, no scene per value",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        // The live battery: every knob is DATA, so changing it repaints the standing tree. The
        // back RECORD is re-registered (wood turns to glass) and the flipped card follows; the
        // RECIPE is swapped mirror→turnOver on the same node; a dangling back never blanks.
        live.setRoot(card(1));
        await settled();
        const woodBack = snapshot(glass);
        registerSurface("tests.flip.back", { layers: [{ paint: "alert" }], radius: 0.08 });
        live.setRoot(card(1));
        await settled();
        const glassBack = snapshot(glass);
        await expect(imagesDiffer(woodBack, glassBack), "re-registering the back record repaints the card").toBe(true);
        // The recipe is a name on the node: same tree, mirror instead of turnOver — the surface
        // stays the front (mirror swaps nothing), so the picture differs from the swapped back.
        live.setRoot(node("aceCard", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "tests.flip.front" }), Flippable({ flip: "mirror", turns: 1 })));
        await settled();
        const mirrored = snapshot(glass);
        await expect(imagesDiffer(glassBack, mirrored), "swapping the recipe changes what a turn does").toBe(true);
        // A back pointing at a record nobody registered: the quad is skipped, but the scene must
        // survive — and putting the name back repaints without a rebuild.
        registerSurface("tests.flip.back", { layers: [{ paint: "accent" }], radius: 0.08 });
        live.setRoot(card(0));
        await settled();
      },
    },
  ]),
};
