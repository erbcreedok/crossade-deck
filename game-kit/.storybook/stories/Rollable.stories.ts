import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  byId,
  Container,
  freeLayout,
  installStockActions,
  node,
  perform,
  polygon,
  rect,
  registerLayout,
  registerSurface,
  Rollable,
  faceOf,
  gridLayout,
  remove,
  setFace,
  Surfaced,
  Transformable,
  Valued,
} from "../../src/index.js";
import { scene, type Scene } from "../devtools/scene.js";
import { documented, PAINTS } from "./surfaceControls.js";

// ROLLABLE says one thing as data: this element lands on one of `sides` faces. Which face is up is
// NOT the atom's — it is `Valued.values.face`, a value like a rank, read by rules the same way; what
// a face LOOKS like is a set's skin (`Add-ons/Dice` draws them). Where the result comes from is not
// the atom's either: the seeded rng, the server, a fixed number — each is a commit the runtime
// plays. This stand shows the atom bare, on a token that carries no skin at all: the verb `roll`
// (the kit's stock action, `Math.random`) writes a face, and the face is read back as a value.

installStockActions();

const meta: Meta = {
  title: "Atoms/Rollable",
  parameters: {
    gkDoc: "rollable.component",
    gkAtom: "Rollable",
    // The atom's one field, on the one scene.
    gkFields: { sides: ["Roll"] },
  },
};
export default meta;

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };
const CORNERS = { control: { type: "range", min: 3, max: 16, step: 1 } };
/** One equality is all Storybook has, so each silhouette names the one die it belongs to. */
const forDie = (sides: number): Record<string, unknown> => ({ if: { arg: "sides", eq: sides } });
/** The stroke's own rows vanish with it — an absent border has no colour to be asked about. */
const STROKED = { if: { arg: "tokenStroke" } };

interface RollArgs {
  sides: number;
  rolled: number;
  deskLayout: string;
  tokenW: number;
  tokenH: number;
  d4Corners: number;
  d4R: number;
  d20Corners: number;
  d20R: number;
  tokenSurface: string;
  tokenPaint: string;
  tokenRadius: number;
  tokenStroke: boolean;
  tokenStrokeColor: string;
  tokenStrokeWidth: number;
  tokenX: number;
  tokenY: number;
  pipsLayout: string;
  pipColumns: number;
  pipGap: number;
  pipsX: number;
  pipsY: number;
  pipW: number;
  pipH: number;
  pipSurface: string;
  pipPaint: string;
  pipRadius: number;
}

/** What each standing scene last saw: the trigger, and the face the token shows. */
const LAST = new WeakMap<HTMLElement, { rolled: number; face?: number }>();

/** One dot of the count — the kit paints no numeral, so a face is shown as that many pips. */
function pip(i: number, w: number, h: number, surface: string) {
  return node(`pip${i}`, Bounded({ bounds: rect(w, h) }), Surfaced({ surface }));
}

/**
 * A BARE TOKEN THAT ROLLS. `sides` is the atom's field; TAP THE TOKEN (or bump `rolled`) and the
 * stock verb `roll` is performed on it — its `values.face` becomes a fresh face from `Math.random`
 * — and the pips under it count that value back, because a face is a value and a value is what
 * rules read. The tumble it plays is the clock's `roll` (`Engine/Motion`), so the face lands on the
 * tumble's LAST turn-over, while the token is still turning. Nothing flickers on the way here on
 * purpose: the pips are the truth counted out, not a picture of it, and the truth changes once.
 */
export const Roll: StoryObj<RollArgs> = {
  render: ({
    sides,
    rolled,
    deskLayout,
    tokenW,
    tokenH,
    d4Corners,
    d4R,
    d20Corners,
    d20R,
    tokenSurface,
    tokenPaint,
    tokenRadius,
    tokenStroke,
    tokenStrokeColor,
    tokenStrokeWidth,
    tokenX,
    tokenY,
    pipsLayout,
    pipColumns,
    pipGap,
    pipsX,
    pipsY,
    pipW,
    pipH,
    pipSurface,
    pipPaint,
    pipRadius,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerLayout(pipsLayout, gridLayout({ columns: pipColumns, gap: pipGap }));
    registerSurface(tokenSurface, {
      layers: [{ paint: tokenPaint }],
      radius: tokenRadius,
      ...(tokenStroke ? { stroke: { color: tokenStrokeColor, width: tokenStrokeWidth } } : {}),
    });
    registerSurface(pipSurface, { layers: [{ paint: pipPaint }], radius: pipRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    const shape = sides === 4 ? polygon(d4Corners, d4R) : sides === 20 ? polygon(d20Corners, d20R) : rect(tokenW, tokenH);
    // The face the token stands on is the LAST scene's — a slider move must not lose the roll.
    const el = LIVE_EL.get("roll");
    const seen = el ? LAST.get(el) : undefined;
    const face = seen?.face !== undefined && seen.face <= sides ? seen.face : undefined;
    add(
      desk,
      node(
        "token",
        Bounded({ bounds: shape }),
        Surfaced({ surface: tokenSurface }),
        Transformable({ at: { x: tokenX, y: tokenY } }),
        Valued({ values: face !== undefined ? { face } : {} }),
        Rollable({ sides }),
      ),
    );
    const pips = node("pips", Container({ layout: pipsLayout }), Transformable({ at: { x: pipsX, y: pipsY } }));
    for (let i = 0; i < (face ?? 0); i++) add(pips, pip(i, pipW, pipH, pipSurface));
    add(desk, pips);
    // The tap is wired ONCE, with the scene, and rolls whatever the newest render left behind.
    const s: Scene = scene(desk, {
      animate: true,
      tap: (hit) => {
        if (hit) TAP.get("roll")?.();
      },
    });
    LIVE_EL.set("roll", s.el);
    const before = LAST.get(s.el);
    LAST.set(s.el, { rolled, ...(face !== undefined ? { face } : {}) });
    const fire = (): void => {
      const live = byId(s.host.root, "token");
      if (!live) return;
      // The verb decides the face NOW (a fresh Math.random on the node's own sides); the tumble
      // shows it when it commits — truth first (`setFace`), then the pips that count it.
      const thrown = faceOf(perform("roll", live));
      s.motions?.roll("token", () => {
        if (thrown === undefined) return;
        setFace(live, thrown);
        LAST.set(s.el, { rolled, face: thrown });
        const box = byId(s.host.root, "pips");
        if (box) {
          for (const c of [...box.children]) remove(box, c);
          for (let i = 0; i < thrown; i++) add(box, pip(i, pipW, pipH, pipSurface));
        }
        s.host.setRoot(s.host.root);
      });
    };
    TAP.set("roll", fire);
    if (before !== undefined && before.rolled !== rolled) fire();
    return s.el;
  },
  args: {
    sides: 6,
    rolled: 0,
    deskLayout: "story.rollable.free",
    tokenW: 0.9,
    tokenH: 0.9,
    d4Corners: 3,
    d4R: 0.6,
    d20Corners: 6,
    d20R: 0.55,
    tokenSurface: "story.rollable.token",
    tokenPaint: "panelBg",
    tokenRadius: 0.16,
    tokenStroke: true,
    tokenStrokeColor: "panelBorder",
    tokenStrokeWidth: 0.03,
    tokenX: 0,
    tokenY: -0.3,
    pipsLayout: "story.rollable.pips",
    pipColumns: 10,
    pipGap: 0.06,
    pipsX: 0,
    pipsY: 1.1,
    pipW: 0.16,
    pipH: 0.16,
    pipSurface: "story.rollable.pip",
    pipPaint: "accent",
    pipRadius: 0.5,
  },
  argTypes: {
    sides: documented("arg.sides", { control: "select", options: [4, 6, 20] }, "token/rollable"),
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    tokenW: documented("arg.w", { ...SIZE, ...forDie(6) }, "token/bounds"),
    tokenH: documented("arg.h", { ...SIZE, ...forDie(6) }, "token/bounds"),
    d4Corners: documented("arg.corners", { ...CORNERS, ...forDie(4) }, "token/bounds"),
    d4R: documented("arg.polyR", { ...SIZE, ...forDie(4) }, "token/bounds"),
    d20Corners: documented("arg.corners", { ...CORNERS, ...forDie(20) }, "token/bounds"),
    d20R: documented("arg.polyR", { ...SIZE, ...forDie(20) }, "token/bounds"),
    tokenSurface: documented("arg.registerAs", TOKEN, "token/surface"),
    tokenPaint: documented("arg.fill", PAINT, "token/surface"),
    tokenRadius: documented("arg.radius", RADIUS, "token/surface"),
    tokenStroke: documented("arg.stroke", {}, "token/surface.stroke"),
    tokenStrokeColor: documented("arg.strokeColor", { ...PAINT, ...STROKED }, "token/surface.stroke"),
    tokenStrokeWidth: documented("arg.strokeWidth", { control: { type: "number", min: 0, step: 0.01 }, ...STROKED }, "token/surface.stroke"),
    tokenX: documented("arg.x", PLACE, "token/transformable"),
    tokenY: documented("arg.y", PLACE, "token/transformable"),
    rolled: documented("arg.rolled", { control: { type: "number", min: 0, step: 1 } }, "token/motion"),
    pipsLayout: documented("arg.layoutName", TOKEN, "pips/container"),
    pipColumns: documented("arg.columns", { control: { type: "range", min: 1, max: 20, step: 1 } }, "pips/container"),
    pipGap: documented("arg.gap", { control: { type: "number", min: 0, step: 0.02 } }, "pips/container"),
    pipsX: documented("arg.x", PLACE, "pips/transformable"),
    pipsY: documented("arg.y", PLACE, "pips/transformable"),
    pipW: documented("arg.w", SIZE, "pips/children"),
    pipH: documented("arg.h", SIZE, "pips/children"),
    pipSurface: documented("arg.registerAs", TOKEN, "pips/surface"),
    pipPaint: documented("arg.fill", PAINT, "pips/surface"),
    pipRadius: documented("arg.radius", RADIUS, "pips/surface"),
  },
  parameters: { gkDocStory: "rollable.roll" },
};
const LIVE_EL = new Map<string, HTMLElement>();
/** What a tap on each scene does RIGHT NOW — the newest render's roll. Looked up at touch time. */
const TAP = new Map<string, () => void>();
