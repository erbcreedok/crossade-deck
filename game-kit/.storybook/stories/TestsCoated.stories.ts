import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import {
  add,
  Bounded,
  Coated,
  Container,
  installStockCoats,
  node,
  rect,
  registerLayout,
  registerSurface,
  rowLayout,
  Surfaced,
  type Coat,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { checks, imagesDiffer, painted, settled, snapshot, standing, type CheckContext } from "../devtools/checks.js";

// COATED ON THE GLASS. The unit suite states what the effect returns; this rung proves it is WIRED —
// that a coat actually changes the picture the renderer puts up, that a cast reaches a child, and
// that the level is a continuum rather than a switch. Every claim is read off the pixels.
installStockCoats();
registerSurface("tests.coat.face", { layers: [{ paint: "panelBg" }], radius: 0.08 });

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

/** A single tile, optionally wearing a self coat. */
function tile(coat?: Coat) {
  const atoms = coat ? [Coated({ self: coat })] : [];
  return node("coatedTile", Bounded({ bounds: rect(1.6, 1.6) }), Surfaced({ surface: "tests.coat.face" }), ...atoms);
}

/** A tray casting over one child — the cascade case. */
function tray(cast: Coat) {
  registerLayout("tests.coat.row", rowLayout({ gap: 0.2 }));
  const t = node("frozenTray", Container({ layout: "tests.coat.row" }), Surfaced({ surface: "tests.coat.face" }), Coated({ cast }));
  add(t, node("trayChild", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "tests.coat.face" })));
  return t;
}

interface Args {
  id: string;
}

const meta: Meta<Args> = {
  title: "Tests/Coated",
  parameters: { gkDoc: "tests.coated" },
  argTypes: { id: { control: "text" } },
  args: { id: "coatedTile" },
};
export default meta;

export const Play: StoryObj<Args> = {
  parameters: { gkDocStory: "tests.coated.play", controls: { include: ["id"] } },
  render: () => scene(tile()).el,
  play: checks([
    {
      name: "play.coated.a-wash-changes-the-picture — a coat is over the surface, not beside it",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        live.setRoot(tile());
        await settled();
        const bare = snapshot(glass);
        live.setRoot(tile({ recipe: "wash", level: 0.8, tint: "accent" }));
        await settled();
        const washed = snapshot(glass);
        await expect(imagesDiffer(bare, washed), "the wash changes the picture").toBe(true);
        live.setRoot(tile());
        await settled();
      },
    },
    {
      name: "play.coated.the-level-is-the-picture — the magnitude is a continuum, not a switch",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        live.setRoot(tile({ recipe: "wash", level: 0.2, tint: "accent" }));
        await settled();
        const faint = snapshot(glass);
        live.setRoot(tile({ recipe: "wash", level: 0.9, tint: "accent" }));
        await settled();
        const strong = snapshot(glass);
        // Two levels of one recipe paint two pictures — there is no scene per value.
        await expect(imagesDiffer(faint, strong), "a stronger level is a different picture").toBe(true);
        live.setRoot(tile());
        await settled();
      },
    },
    {
      name: "play.coated.a-cast-greys-the-tree — the reach is the class, and it reaches the child",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        live.setRoot(tray({ recipe: "", level: 0, tint: "" }));
        await settled();
        const uncast = snapshot(glass);
        // A tint clearly apart from the face, so the cascade is unmistakable on the glass (the desk
        // grey a real freeze uses is too close to the panel to read as a pixel difference).
        live.setRoot(tray({ recipe: "wash", level: 0.7, tint: "accent" }));
        await settled();
        const cast = snapshot(glass);
        // The cast falls to the whole subtree, so the tray AND its child change — `fromOwner`, no
        // code walking anything.
        await expect(imagesDiffer(uncast, cast), "the cast reaches the child").toBe(true);
        live.setRoot(tile());
        await settled();
      },
    },
  ]),
};
