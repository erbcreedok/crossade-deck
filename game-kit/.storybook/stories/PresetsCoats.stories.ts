import type { Meta, StoryObj } from "@storybook/html";
import { add, Bounded, Coated, Container, installStockCoats, node, rect, registerLayout, rowLayout, Surfaced, type Coat as CoatData } from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, hiddenRow, PAINTS } from "./surfaceControls.js";
import { BACK_SURFACE, crossade, faceSurface, installClassicSkin, type CardSpec } from "@game-presets/cards";
import { DIE_SIZE, faceSurface as dieFace, installDiceSkin } from "@game-presets/dice";

// The skin keeps these private; a scene still needs a box.
const CARD_W = 1;
const CARD_H = 1.4;

// PRESETS THAT MIX A RUNTIME COAT — one page per stock recipe, in isolation, with only its own knobs.
//
// The recipes are DATA the kit ships; `Atoms/Coated` teaches the atom and the reach, this shelf
// answers the narrower question a gamedev has — "what does the `wash`/`ring`/`fill`/`censor` name
// already look like, and what does its `level` do". So the controls are the coat's own, never a
// whole tree. `clear` draws nothing BY ITSELF, so its page shows it at work: inside a cast it is
// the one recipe whose whole job is to stop one.
installStockCoats();

interface CoatArgs {
  self: CoatData;
}

/**
 * The knobs of the ONE coat these pages show, under the names the atom gives them.
 *
 * The recipe is part of the value and not part of the panel: a page called `Wash` that let a reader
 * pick `ring` would be a page whose name is a lie. So it rides in the args — where the snippet needs
 * it, because the snippet is the coat the reader would write — and stays off the controls.
 */
const coatControls: Record<string, unknown> = {
  self: hiddenRow(),
  "self.recipe": hiddenRow(),
  "self.level": documented("arg.coatLevel", { control: { type: "number", min: 0, max: 1, step: 0.05 } }, "self"),
  "self.tint": documented("arg.coatTint", { control: "select", options: ["", ...PAINTS] }, "self"),
};

const box = (surface: string, self: CoatData) =>
  scene(node("coatedTile", Bounded({ bounds: rect(1.6, 1.6) }), Surfaced({ surface }), Coated({ self }))).el;

const meta: Meta = {
  title: "Presets/Coats",
  parameters: { gkDoc: "presetsCoats.component" },
};
export default meta;

export const Wash: StoryObj<CoatArgs> = {
  // A flat colour over the surface, opacity from `level`. The continuum — a charge, a dim, an HP
  // fade — is one recipe; drag `level` and pick a `tint`, there is no scene per value.
  render: ({ self }) => box("plate", self),
  args: { self: { recipe: "wash", level: 0.6, tint: "accent" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.wash" },
};

export const Ring: StoryObj<CoatArgs> = {
  // A stroke around the contour, its weight from `level` — a selection ring, a ward. It replaces the
  // surface's own border while it lasts, one stroke per quad.
  render: ({ self }) => box("plate", self),
  args: { self: { recipe: "ring", level: 0.6, tint: "accent" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.ring" },
};

export const Fill: StoryObj<CoatArgs> = {
  // The blueprint completing: a SOLID coat over `level` of the face, bottom-up, cut where the
  // level stops. A different KIND of mark from `wash` — a half-built thing is half DRAWN, not half
  // faded — and the hard cut edge is what says so. Drag `level` and watch it build.
  render: ({ self }) => box("plate", self),
  args: { self: { recipe: "fill", level: 0.4, tint: "accent" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.fill" },
};

export const Clear: StoryObj<CoatArgs> = {
  // The recipe that draws NOTHING — its whole job is to STOP a cast. The tray casts a wash over
  // both tiles; the right one carries `clear`, so the nearest-cast walk stops there and the tile
  // stays lit. "All but this one" is a dim on the tray and a `clear` on the exception.
  render: ({ self }) => {
    registerLayout("preset.clear.row", rowLayout({ gap: 0.3 }));
    const tray = node(
      "castTray",
      Container({ layout: "preset.clear.row" }),
      Surfaced({ surface: "plate" }),
      // The tray casts what the knobs say; the arg IS the coat, so the snippet is the coat.
      Coated({ cast: self }),
    );
    add(tray, node("dimTile", Bounded({ bounds: rect(1.2, 1.2) }), Surfaced({ surface: "plate" })));
    add(
      tray,
      node(
        "litTile",
        Bounded({ bounds: rect(1.2, 1.2) }),
        Surfaced({ surface: "plate" }),
        Coated({ cast: { recipe: "clear", level: 0, tint: "" } }),
      ),
    );
    return scene(tray).el;
  },
  args: { self: { recipe: "wash", level: 0.6, tint: "stageBg" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.clear" },
};

export const Censor: StoryObj<CoatArgs> = {
  // The face GROUND UP: motes born on the node's own silhouette, each the colour of the spot it came
  // from, drifting off and replaced. Drag `level`: the cloud thickens.
  //
  // ON REAL FACES, and that is not decoration. The whole claim of this recipe is that a censored ace
  // of spades still reads as an ace of spades — on a blank plate every mote is the plate's one
  // colour, and the page would show a grey square with a few specks, which is the very thing the
  // recipe exists NOT to be. `shelf` is declared further down and that is fine: a story's `render`
  // runs long after the module has finished evaluating.
  render: ({ self }) => shelf(self),
  args: { self: { recipe: "censor", level: 0.9, tint: "" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.censor" },
};

// ---- the MODIFIERS — what a thing is MADE OF, over what it is a picture of -------------------
//
// Balatro's editions. Every one lands on ANY node with a surface — a die, a tile, a button, a
// panel — because a coat knows nothing about cards. Shown on a ROW of three grounds rather than one
// tile, because half of what an edition does is how it sits on what is under it: a foil on a bright
// plate and a foil on a well are not the same picture, and one tile would hide that.

const shelf = (self: CoatData) => {
  // An edition goes ON something: an ace, a back and a die, not three blank plates.
  installClassicSkin();
  installDiceSkin();
  registerLayout("coats.row", rowLayout({ gap: 0.22, padding: 0 }));
  const ace = crossade().find((c: CardSpec) => c.id === "spade-A")!;
  const worn = Coated({ self });
  const row = node("shelf", Container({ layout: "coats.row" }));
  add(row, node("aceOfSpades", Bounded({ bounds: rect(CARD_W, CARD_H) }), Surfaced({ surface: faceSurface(ace) }), worn));
  add(row, node("back", Bounded({ bounds: rect(CARD_W, CARD_H) }), Surfaced({ surface: BACK_SURFACE }), worn));
  add(row, node("die", Bounded({ bounds: rect(DIE_SIZE, DIE_SIZE) }), Surfaced({ surface: dieFace("d6", 5) }), worn));
  return scene(row).el;
};

export const Foil: StoryObj<CoatArgs> = {
  // A cold sheen: a film over the whole face and a bright hairline round it — the two things a
  // laminated surface does to light, and the two a renderer with no shader can honestly do.
  render: ({ self }) => shelf(self),
  args: { self: { recipe: "foil", level: 0.8, tint: "" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.foil" },
};

export const Polychrome: StoryObj<CoatArgs> = {
  // The iridescent one. THREE films at three hues, because one tint reads as a stain and three at
  // low opacity read as a surface that cannot decide. The recipe walks the wheel itself.
  render: ({ self }) => shelf(self),
  args: { self: { recipe: "polychrome", level: 0.9, tint: "" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.polychrome" },
};

export const Glass: StoryObj<CoatArgs> = {
  // See-through and blurred, on the same shader the censor clocks. What makes it glass rather than
  // a censor is that it barely tints and keeps a bright rim, so what is under it stays readable.
  render: ({ self }) => shelf(self),
  args: { self: { recipe: "glass", level: 0.7, tint: "" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.glass" },
};

export const Frost: StoryObj<CoatArgs> = {
  // Glass without the rim — the soft pane a dialog puts over the table behind it.
  render: ({ self }) => shelf(self),
  args: { self: { recipe: "frost", level: 0.7, tint: "" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.frost" },
};

export const Faded: StoryObj<CoatArgs> = {
  // Barely there. Toward the DESK, not toward a colour — that is what a viewer means by
  // "transparent", and a coat cannot make the surface under it see-through however it is named.
  render: ({ self }) => shelf(self),
  args: { self: { recipe: "faded", level: 0.6, tint: "" } },
  argTypes: coatControls,
  parameters: { gkDocStory: "presetsCoats.faded" },
};
