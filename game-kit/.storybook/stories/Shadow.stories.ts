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
  type Frame,
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

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };
const HEIGHT = { control: { type: "range", min: 0, max: 5, step: 0.5 } };

const contour = (part: string): Record<string, unknown> =>
  documented("arg.from", { control: "select", options: ["footprint", "silhouette"] }, part);
const lamp = (part: string): Record<string, unknown> =>
  documented("arg.light.angle", { control: { type: "range", min: 0, max: 360, step: 5 } }, part);
const frameOf = (part: string): Record<string, unknown> =>
  documented("arg.frame", { control: "select", options: ["viewer", "world"] }, part);

interface CastArgs {
  id: string;
  deskLayout: string;
  frame: Frame;
  angle: number;
  cardW: number;
  cardH: number;
  cardSurface: string;
  cardPaint: string;
  cardRadius: number;
  cardX: number;
  cardY: number;
  cardZ: number;
  cardFrom: "footprint" | "silhouette";
  starPoints: number;
  starOuterR: number;
  starInnerR: number;
  sparkSurface: string;
  sparkPaint: string;
  sparkX: number;
  sparkY: number;
  sparkZ: number;
  sparkFrom: "footprint" | "silhouette";
}

export const Cast: StoryObj<CastArgs> = {
  // A rounded card and a star token under one lamp. `from` picks the contour that falls — on the
  // card, `silhouette` keeps the rounded corners and `footprint` squares them off. `z` is the
  // pose's own height, and the shadow stretches with it: the fall is a CONSEQUENCE, there is no
  // shadow-length knob to disagree with the height. `angle` walks the light around the desk.
  render: ({
    id,
    deskLayout,
    frame,
    angle,
    cardW,
    cardH,
    cardSurface,
    cardPaint,
    cardRadius,
    cardX,
    cardY,
    cardZ,
    cardFrom,
    starPoints,
    starOuterR,
    starInnerR,
    sparkSurface,
    sparkPaint,
    sparkX,
    sparkY,
    sparkZ,
    sparkFrom,
  }) => {
    registerSurface(cardSurface, { layers: [{ paint: cardPaint }], radius: cardRadius });
    registerSurface(sparkSurface, { layers: [{ paint: sparkPaint }] });
    registerLayout(deskLayout, freeLayout);
    const desk = node("desk", Container({ layout: deskLayout }), Lit({ light: { frame, angle } }));
    add(
      desk,
      node(
        id.trim() || "card",
        Bounded({ bounds: rect(cardW, cardH) }),
        Surfaced({ surface: cardSurface }),
        Transformable({ at: { x: cardX, y: cardY }, z: cardZ }),
        ShadowCaster({ from: cardFrom }),
      ),
    );
    add(
      desk,
      node(
        "spark",
        Bounded({ bounds: star(starPoints, starOuterR, starInnerR) }),
        Surfaced({ surface: sparkSurface }),
        Transformable({ at: { x: sparkX, y: sparkY }, z: sparkZ }),
        ShadowCaster({ from: sparkFrom }),
      ),
    );
    return scene(desk).el;
  },
  args: {
    id: "card",
    deskLayout: "story.shadow.free",
    frame: "viewer",
    angle: 315,
    cardW: 1,
    cardH: 1.4,
    cardSurface: "story.shadow.face",
    cardPaint: "accent",
    cardRadius: 0.18,
    cardX: -1,
    cardY: 0,
    cardZ: 1,
    cardFrom: "silhouette",
    starPoints: 5,
    starOuterR: 0.55,
    starInnerR: 0.26,
    sparkSurface: "story.shadow.star",
    sparkPaint: "alert",
    sparkX: 1.1,
    sparkY: 0.1,
    sparkZ: 1,
    sparkFrom: "silhouette",
  },
  argTypes: {
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    frame: frameOf("desk/lit.light"),
    angle: lamp("desk/lit.light"),
    id: documented("arg.id", { control: "text" }, "card/node"),
    cardW: documented("arg.w", SIZE, "card/bounds"),
    cardH: documented("arg.h", SIZE, "card/bounds"),
    cardSurface: documented("arg.registerAs", TOKEN, "card/surface"),
    cardPaint: documented("arg.fill", PAINT, "card/surface"),
    cardRadius: documented("arg.radius", RADIUS, "card/surface"),
    cardX: documented("arg.x", PLACE, "card/transformable"),
    cardY: documented("arg.y", PLACE, "card/transformable"),
    cardZ: documented("arg.z", HEIGHT, "card/transformable"),
    cardFrom: contour("card/shadowCaster"),
    starPoints: documented("arg.points", { control: { type: "range", min: 3, max: 16, step: 1 } }, "spark/bounds"),
    starOuterR: documented("arg.outerR", SIZE, "spark/bounds"),
    starInnerR: documented("arg.innerR", SIZE, "spark/bounds"),
    sparkSurface: documented("arg.registerAs", TOKEN, "spark/surface"),
    sparkPaint: documented("arg.fill", PAINT, "spark/surface"),
    sparkX: documented("arg.x", PLACE, "spark/transformable"),
    sparkY: documented("arg.y", PLACE, "spark/transformable"),
    sparkZ: documented("arg.z", HEIGHT, "spark/transformable"),
    sparkFrom: contour("spark/shadowCaster"),
  },
  parameters: { gkDocStory: "shadowCaster.cast" },
};

interface StackArgs {
  deskLayout: string;
  frame: Frame;
  angle: number;
  pileW: number;
  pileH: number;
  pileLayout: string;
  pileSurface: string;
  pilePaint: string;
  pileRadius: number;
  pileX: number;
  pileY: number;
  pileFrom: "footprint" | "silhouette";
  piledCards: number;
  cardW: number;
  cardH: number;
  cardSurface: string;
  cardPaint: string;
  cardRadius: number;
  driftX: number;
  driftY: number;
  piledFrom: "footprint" | "silhouette";
  looseW: number;
  looseH: number;
  looseX: number;
  looseY: number;
  looseFrom: "footprint" | "silhouette";
}

export const Stack: StoryObj<StackArgs> = {
  // A resting stack casts ONCE: the pile carries the atom, and the nearest casting owner speaks
  // for its whole subtree — three cards inside lay no shadows of their own. The loose card
  // beside it stands alone, so it casts alone. Nothing is toggled: detaching a card from the
  // pile IS what starts its shadow.
  render: ({
    deskLayout,
    frame,
    angle,
    pileW,
    pileH,
    pileLayout,
    pileSurface,
    pilePaint,
    pileRadius,
    pileX,
    pileY,
    pileFrom,
    piledCards,
    cardW,
    cardH,
    cardSurface,
    cardPaint,
    cardRadius,
    driftX,
    driftY,
    piledFrom,
    looseW,
    looseH,
    looseX,
    looseY,
    looseFrom,
  }) => {
    registerSurface(pileSurface, { layers: [{ paint: pilePaint }], radius: pileRadius });
    registerSurface(cardSurface, { layers: [{ paint: cardPaint }], radius: cardRadius });
    registerLayout(deskLayout, freeLayout);
    registerLayout(pileLayout, freeLayout);
    const desk = node("desk", Container({ layout: deskLayout }), Lit({ light: { frame, angle } }));
    const pile = node(
      "pile",
      Bounded({ bounds: rect(pileW, pileH) }),
      Container({ layout: pileLayout }),
      Surfaced({ surface: pileSurface }),
      Transformable({ at: { x: pileX, y: pileY } }),
      ShadowCaster({ from: pileFrom }),
    );
    for (let i = 0; i < piledCards; i++) {
      add(
        pile,
        node(
          `piled#${i}`,
          Bounded({ bounds: rect(cardW, cardH) }),
          Surfaced({ surface: cardSurface }),
          Transformable({ at: { x: driftX * i, y: driftY * i } }),
          ShadowCaster({ from: piledFrom }),
        ),
      );
    }
    add(desk, pile);
    add(
      desk,
      node(
        "loose",
        Bounded({ bounds: rect(looseW, looseH) }),
        Surfaced({ surface: cardSurface }),
        Transformable({ at: { x: looseX, y: looseY } }),
        ShadowCaster({ from: looseFrom }),
      ),
    );
    return scene(desk).el;
  },
  args: {
    deskLayout: "story.shadow.stack.free",
    frame: "viewer",
    angle: 315,
    pileW: 1.6,
    pileH: 2,
    pileLayout: "story.shadow.pile.free",
    pileSurface: "story.shadow.pile",
    pilePaint: "sunkBg",
    pileRadius: 0.1,
    pileX: -1,
    pileY: 0,
    pileFrom: "silhouette",
    piledCards: 3,
    cardW: 1,
    cardH: 1.4,
    cardSurface: "story.shadow.card",
    cardPaint: "panelBg",
    cardRadius: 0.08,
    driftX: 0.06,
    driftY: 0.06,
    piledFrom: "silhouette",
    looseW: 1,
    looseH: 1.4,
    looseX: 1.3,
    looseY: 0.2,
    looseFrom: "silhouette",
  },
  argTypes: {
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    frame: frameOf("desk/lit.light"),
    angle: lamp("desk/lit.light"),
    pileW: documented("arg.w", SIZE, "pile/bounds"),
    pileH: documented("arg.h", SIZE, "pile/bounds"),
    pileLayout: documented("arg.layoutName", TOKEN, "pile/container"),
    pileSurface: documented("arg.registerAs", TOKEN, "pile/surface"),
    pilePaint: documented("arg.fill", PAINT, "pile/surface"),
    pileRadius: documented("arg.radius", RADIUS, "pile/surface"),
    pileX: documented("arg.x", PLACE, "pile/transformable"),
    pileY: documented("arg.y", PLACE, "pile/transformable"),
    pileFrom: contour("pile/shadowCaster"),
    piledCards: documented("arg.childCount", { control: { type: "range", min: 0, max: 8, step: 1 } }, "piled cards/children"),
    cardW: documented("arg.w", SIZE, "piled cards/bounds"),
    cardH: documented("arg.h", SIZE, "piled cards/bounds"),
    cardSurface: documented("arg.registerAs", TOKEN, "piled cards/surface"),
    cardPaint: documented("arg.fill", PAINT, "piled cards/surface"),
    cardRadius: documented("arg.radius", RADIUS, "piled cards/surface"),
    driftX: documented("arg.driftX", PLACE, "piled cards/transformable"),
    driftY: documented("arg.driftY", PLACE, "piled cards/transformable"),
    piledFrom: contour("piled cards/shadowCaster"),
    looseW: documented("arg.w", SIZE, "loose card/bounds"),
    looseH: documented("arg.h", SIZE, "loose card/bounds"),
    looseX: documented("arg.x", PLACE, "loose card/transformable"),
    looseY: documented("arg.y", PLACE, "loose card/transformable"),
    looseFrom: contour("loose card/shadowCaster"),
  },
  parameters: { gkDocStory: "shadowCaster.stack" },
};
