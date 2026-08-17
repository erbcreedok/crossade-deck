import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  Container,
  freeLayout,
  Lit,
  node,
  rect,
  registerLayout,
  registerSurface,
  ShadowCaster,
  star,
  Surfaced,
  Transformable,
} from "../../src/index.js";
import { scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// SHADOWCASTER draws nothing on its own — it declares that a shadow FALLS, and which contour
// falls: `footprint` is the bare box a piece stands on, `silhouette` the contour as DRAWN,
// corners and all. The shadow itself is a LAYER the plan lays in one pass under everything at
// rest; its direction comes from the root's one lamp (`Lit`), and its length from the resolved
// `z` — height is the source, the shadow its consequence. Today the two contours differ by the
// record's corner radius; the day a piece wears a real figure skin, `silhouette` follows it.

const meta: Meta = {
  title: "Atoms/ShadowCaster",
  parameters: {
    gkDoc: "shadowCaster.component",
    gkAtom: "ShadowCaster",
    // The atom's one field, reachable from both scenes.
    gkFields: { from: ["Cast", "Stack"] },
  },
};
export default meta;

interface CastArgs {
  id: string;
  face: string;
  from: "footprint" | "silhouette";
  z: number;
  angle: number;
}

const fromControl = documented("arg.from", { control: "select", options: ["footprint", "silhouette"] }, "shadow");
const lampControl = documented("arg.light.angle", { control: { type: "range", min: 0, max: 360, step: 5 } }, "light");

export const Cast: StoryObj<CastArgs> = {
  // A rounded card and a star token under one lamp. `from` picks the contour that falls — on the
  // card, `silhouette` keeps the rounded corners and `footprint` squares them off. `z` is the
  // pose's own height, and the shadow stretches with it: the fall is a CONSEQUENCE, there is no
  // shadow-length knob to disagree with the height. `angle` walks the light around the desk.
  render: (a) => {
    registerSurface("story.shadow.face", { layers: [{ paint: a.face }], radius: 0.18 });
    registerSurface("story.shadow.star", { layers: [{ paint: "alert" }] });
    registerLayout("story.shadow.free", freeLayout);
    const desk = node(
      "desk",
      Container({ layout: "story.shadow.free" }),
      Lit({ light: { frame: "viewer", angle: a.angle } }),
    );
    add(
      desk,
      node(
        a.id.trim() || "card",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.shadow.face" }),
        Transformable({ at: { x: -1, y: 0 }, z: a.z }),
        ShadowCaster({ from: a.from }),
      ),
    );
    add(
      desk,
      node(
        "spark",
        Bounded({ bounds: star(5, 0.55, 0.26) }),
        Surfaced({ surface: "story.shadow.star" }),
        Transformable({ at: { x: 1.1, y: 0.1 }, z: a.z }),
        ShadowCaster({ from: a.from }),
      ),
    );
    return scene(desk).el;
  },
  args: { id: "card", face: "accent", from: "silhouette", z: 1, angle: 315 },
  argTypes: {
    id: documented("arg.id", { control: "text" }, "node"),
    face: documented("arg.face", { control: "select", options: PAINTS }, "surface"),
    from: fromControl,
    z: documented("arg.z", { control: { type: "range", min: 0, max: 5, step: 0.5 } }, "shadow"),
    angle: lampControl,
  },
  parameters: { gkDocStory: "shadowCaster.cast" },
};

interface StackArgs {
  from: "footprint" | "silhouette";
  angle: number;
}

export const Stack: StoryObj<StackArgs> = {
  // A resting stack casts ONCE: the pile carries the atom, and the nearest casting owner speaks
  // for its whole subtree — three cards inside lay no shadows of their own. The loose card
  // beside it stands alone, so it casts alone. Nothing is toggled: detaching a card from the
  // pile IS what starts its shadow.
  render: (a) => {
    registerSurface("story.shadow.pile", { layers: [{ paint: "sunkBg" }], radius: 0.1 });
    registerSurface("story.shadow.card", { layers: [{ paint: "panelBg" }], radius: 0.08 });
    registerLayout("story.shadow.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.shadow.free" }), Lit({ light: { frame: "viewer", angle: a.angle } }));
    const pile = node(
      "pile",
      Bounded({ bounds: rect(1.6, 2) }),
      Container({ layout: "story.shadow.free" }),
      Surfaced({ surface: "story.shadow.pile" }),
      Transformable({ at: { x: -1, y: 0 } }),
      ShadowCaster({ from: a.from }),
    );
    for (let i = 0; i < 3; i++) {
      add(
        pile,
        node(
          `piled#${i}`,
          Bounded({ bounds: rect(1, 1.4) }),
          Surfaced({ surface: "story.shadow.card" }),
          Transformable({ at: { x: 0.06 * i, y: 0.06 * i } }),
          ShadowCaster({ from: a.from }),
        ),
      );
    }
    add(desk, pile);
    add(
      desk,
      node(
        "loose",
        Bounded({ bounds: rect(1, 1.4) }),
        Surfaced({ surface: "story.shadow.card" }),
        Transformable({ at: { x: 1.3, y: 0.2 } }),
        ShadowCaster({ from: a.from }),
      ),
    );
    return scene(desk).el;
  },
  args: { from: "silhouette", angle: 315 },
  argTypes: { from: fromControl, angle: lampControl },
  parameters: { gkDocStory: "shadowCaster.stack" },
};
