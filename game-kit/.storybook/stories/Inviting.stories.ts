import type { Meta, StoryObj } from "@storybook/html";
import {
  Acceptor,
  add,
  Bounded,
  coatNames,
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
import { documented, PAINTS } from "./surfaceControls.js";

// INVITING is the LOOK of willingness: one coat a zone wears while a drag it would take is in
// flight. Whether the zone is willing is never decided here — that is the Acceptor's verdict, and
// a game whose legality lives in functions picks its zones itself and uses the same wear/undo
// protocol. Grab dresses, release undresses; the tree carries no "highlighted" flag anywhere.
//
// The recipes and the carry styles are installed here, as an ordinary consumer would.
installStockCoats();
installStockCarries();

const meta: Meta = {
  title: "Atoms/Inviting",
  parameters: {
    gkDoc: "inviting.component",
    gkAtom: "Inviting",
    // The atom's one field: all three knobs of the coat live on the one scene.
    gkFields: { coat: ["Invite"] },
  },
};
export default meta;

interface InviteArgs {
  recipe: string;
  level: number;
  tint: string;
}

export const Invite: StoryObj<InviteArgs> = {
  // A zone that takes SEVENS, and two cards you can drag at it. Pick up the seven and the zone
  // puts its invite on — ring, wash, whatever the knobs say; let go and it comes off. Pick up
  // the eight and nothing lights: the rule answered `deny`, and an unwilling zone has nothing
  // to show. The verdict is the Acceptor's; the atom only says what willingness LOOKS like.
  render: (a) => {
    registerSurface("story.invite.zone", { layers: [{ paint: "sunkBg" }], radius: 0.12 });
    registerSurface("story.invite.seven", { layers: [{ paint: "accent" }], radius: 0.08 });
    registerSurface("story.invite.eight", { layers: [{ paint: "textMuted" }], radius: 0.08 });
    registerLayout("story.invite.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.invite.free" }));
    add(
      desk,
      node(
        "sevenZone",
        Bounded({ bounds: rect(1.5, 1.9) }),
        Container({ layout: "story.invite.free" }),
        Surfaced({ surface: "story.invite.zone" }),
        Transformable({ at: { x: 1.2, y: 0 } }),
        Acceptor({ accept: { eq: ["el.values.rank", 7] } }),
        Inviting({ coat: { recipe: a.recipe, level: a.level, tint: a.tint } }),
      ),
    );
    add(
      desk,
      node(
        "seven",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.invite.seven" }),
        Transformable({ at: { x: -1.4, y: -0.8 } }),
        Valued({ values: { rank: 7 } }),
        Draggable(),
      ),
    );
    add(
      desk,
      node(
        "eight",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.invite.eight" }),
        Transformable({ at: { x: -1.4, y: 0.9 } }),
        Valued({ values: { rank: 8 } }),
        Draggable(),
      ),
    );
    return wireDrag(scene(desk, { animate: true }), { lift: 1.06, tilt: { factor: 3, maxDeg: 15 } }).el;
  },
  args: { recipe: "ring", level: 0.7, tint: "accent" },
  argTypes: {
    recipe: documented("arg.coatRecipe", { control: "select", options: [...coatNames()] }, "invite"),
    level: documented("arg.coatLevel", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "invite"),
    tint: documented("arg.coatTint", { control: "select", options: PAINTS }, "invite"),
  },
  parameters: { gkDocStory: "inviting.invite" },
};
