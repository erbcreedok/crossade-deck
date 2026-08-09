import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import { add, Bounded, node, rect, Surfaced } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { checks, differs, painted, pixelAt, settled, standing, type CheckContext } from "../devtools/checks.js";

interface BareArgs {
  id: string;
}

// THE SECTION IS THE SWITCH. These stories run their checks the moment they open — opening the
// page IS the request, which is what keeps "runs only when asked" true without a hidden toggle
// somebody has to be told about. The rest of the catalog stays a catalog: a reader turning a
// knob on `Bounded` is not driving a test suite, because those stories carry no play at all.
//
// Prose is a KEY (`gkDoc`), resolved at render time from `locales/*.json` — see DocsPage.
const meta: Meta<BareArgs> = {
  title: "Tests/Node",
  parameters: { gkDoc: "tests.node" },
  argTypes: { id: { control: "text" } },
  args: { id: "root" },
};
export default meta;

// THE FIRST RUNG, AND THE ONE THE REST STAND ON: a node is there, it goes, it comes back.
//
// Every claim below is made in the unit suite already — and every one of them is made there
// against a fake. What this rung adds is the only thing that layer cannot reach: the claim is
// re-made on a real canvas, with a real renderer, in a real document. "The plan says the node
// is gone" and "the node is off the glass" have been two different statements in this project
// once before, and this is where they are compared.
//
// Off unless the switch above the tree is on — see `devtools/checks.ts`.

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

/** A tree with the card, or without it. The one difference the whole rung turns on. */
function tree(id: string, withCard: boolean) {
  const root = node(id.trim() || "root");
  if (withCard) add(root, node("card", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "plate" })));
  return root;
}

export const Lifecycle: StoryObj<BareArgs> = {
  args: { id: "root" },
  parameters: { gkDocStory: "tests.node.lifecycle", controls: { include: ["id"] } },
  render: ({ id }) => scene(tree(id, true)).el,
  play: checks([
    {
      name: "play.node.it-is-there — one card, and it is on the glass",
      async run(ctx) {
        const glass = await view(ctx);
        // The middle of the canvas is where the card is, and it is not the desk behind it.
        const centre = pixelAt(glass, 0.5, 0.5);
        const corner = pixelAt(glass, 0.02, 0.02);
        await expect(differs(centre, corner)).toBe(true);
      },
    },
    {
      name: "play.node.it-goes — the same tree without it leaves bare desk",
      async run(ctx) {
        const glass = await view(ctx);
        const withCard = pixelAt(glass, 0.5, 0.5);
        const scene = await standing(ctx);
        scene.setRoot(tree(ctx.args["id"] as string, false));
        await settled();
        const bare = pixelAt(glass, 0.5, 0.5);
        // The middle now reads like the desk it stands on, not like a card.
        await expect(differs(withCard, bare)).toBe(true);
        await expect(differs(bare, pixelAt(glass, 0.02, 0.02))).toBe(false);
        await expect(scene.host.root.children).toHaveLength(0);
      },
    },
    {
      name: "play.node.it-comes-back — and the canvas is the same canvas",
      async run(ctx) {
        const glass = await view(ctx);
        const scene = await standing(ctx);
        scene.setRoot(tree(ctx.args["id"] as string, true));
        await settled();
        await expect(differs(pixelAt(glass, 0.5, 0.5), pixelAt(glass, 0.02, 0.02))).toBe(true);
        // THE SAME canvas, which is the half of the claim a picture cannot make. A new tree is
        // new DATA: rebuilding the scene would spend another WebGL context, and a browser hands
        // out about a dozen before it starts taking them back.
        await expect(await view(ctx)).toBe(glass);
      },
    },
    {
      name: "play.node.repeats — twenty rounds in and out, and the picture does not drift",
      async run(ctx) {
        // The stress case, on the glass. A renderer that ACCUMULATES — a sprite added rather
        // than replaced, a layer drawn a second time — looks right on the first frame and wrong
        // on the twentieth, which is the failure nobody ever reproduces on demand.
        const glass = await view(ctx);
        const scene = await standing(ctx);
        const first = pixelAt(glass, 0.5, 0.5);
        const id = ctx.args["id"] as string;
        for (let i = 0; i < 20; i += 1) {
          scene.setRoot(tree(id, false));
          await settled();
          scene.setRoot(tree(id, true));
          await settled();
        }
        await expect(differs(first, pixelAt(glass, 0.5, 0.5))).toBe(false);
        await expect(scene.host.root.children).toHaveLength(1);
      },
    },
  ]),
};
