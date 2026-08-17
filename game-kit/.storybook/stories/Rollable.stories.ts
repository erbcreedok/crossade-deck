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
import { documented } from "./surfaceControls.js";

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

interface RollArgs {
  sides: number;
  rolled: number;
}

/** What each standing scene last saw: the trigger, and the face the token shows. */
const LAST = new WeakMap<HTMLElement, { rolled: number; face?: number }>();

/** The face as PIPS — `face` small dots in a grid beside the token: the kit paints no numeral, so the value is shown as a count. */
function pips(face: number | undefined) {
  const box = node("pips", Container({ layout: "story.rollable.pips" }), Transformable({ at: { x: 0, y: 1.1 } }));
  for (let i = 0; i < (face ?? 0); i++) add(box, node(`pip${i}`, Bounded({ bounds: rect(0.16, 0.16) }), Surfaced({ surface: "story.rollable.pip" })));
  return box;
}

/**
 * A BARE TOKEN THAT ROLLS. `sides` is the atom's field; bump `rolled` and the stock verb `roll` is
 * performed on the token — its `values.face` becomes a fresh face from `Math.random` — and the pips
 * under it count that value back, because a face is a value and a value is what rules read. The
 * tumble it plays is the clock's `roll` (`Engine/Motion`), so the face lands late in the turn.
 */
export const Roll: StoryObj<RollArgs> = {
  render: (a) => {
    registerLayout("story.rollable.free", freeLayout);
    registerLayout("story.rollable.pips", gridLayout({ columns: 10, gap: 0.06 }));
    registerSurface("story.rollable.token", { layers: [{ paint: "panelBg" }], radius: 0.16, stroke: { color: "panelBorder", width: 0.03 } });
    registerSurface("story.rollable.pip", { layers: [{ paint: "accent" }], radius: 0.5 });
    const desk = node("desk", Container({ layout: "story.rollable.free" }));
    const shape = a.sides === 4 ? polygon(3, 0.6) : a.sides === 20 ? polygon(6, 0.55) : rect(0.9, 0.9);
    // The face the token stands on is the LAST scene's — a slider move must not lose the roll.
    const el = LIVE_EL.get("roll");
    const seen = el ? LAST.get(el) : undefined;
    const face = seen?.face !== undefined && seen.face <= a.sides ? seen.face : undefined;
    add(
      desk,
      node(
        "token",
        Bounded({ bounds: shape }),
        Surfaced({ surface: "story.rollable.token" }),
        Transformable({ at: { x: 0, y: -0.3 } }),
        Valued({ values: face !== undefined ? { face } : {} }),
        Rollable({ sides: a.sides }),
      ),
    );
    add(desk, pips(face));
    const s: Scene = scene(desk, { animate: true });
    LIVE_EL.set("roll", s.el);
    const before = LAST.get(s.el);
    LAST.set(s.el, { rolled: a.rolled, ...(face !== undefined ? { face } : {}) });
    if (before !== undefined && before.rolled !== a.rolled) {
      const live = byId(s.host.root, "token");
      if (live) {
        // The verb decides the face NOW (a fresh Math.random on the node's own sides); the tumble
        // shows it when it commits — truth first (`setFace`), then the pips that count it.
        const thrown = faceOf(perform("roll", live));
        s.motions?.roll("token", () => {
          if (thrown === undefined) return;
          setFace(live, thrown);
          LAST.set(s.el, { rolled: a.rolled, face: thrown });
          const box = byId(s.host.root, "pips");
          if (box) {
            for (const c of [...box.children]) remove(box, c);
            for (let i = 0; i < thrown; i++) add(box, node(`pip${i}`, Bounded({ bounds: rect(0.16, 0.16) }), Surfaced({ surface: "story.rollable.pip" })));
          }
          s.host.setRoot(s.host.root);
        });
      }
    }
    return s.el;
  },
  args: { sides: 6, rolled: 0 },
  argTypes: {
    sides: documented("arg.sides", { control: "select", options: [4, 6, 20] }, "rollable"),
    rolled: documented("arg.rolled", { control: { type: "number", min: 0, step: 1 } }, "motion"),
  },
  parameters: { gkDocStory: "rollable.roll" },
};
const LIVE_EL = new Map<string, HTMLElement>();
