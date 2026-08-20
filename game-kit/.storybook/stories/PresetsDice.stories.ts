// ADD-ONS / DICE — d4, d6, d20, documented in the kit's catalog but built by a SEPARATE package
// (`@game-presets/dice`). The add-on ships the kinds (sides, silhouettes), the face textures, the
// classic skin and the throws; the engine carries the atom (`Rollable`), the verb (`roll`), the
// tumble and the ballistics — and nothing of what a die looks like.
//
// The dice are imported BY PACKAGE NAME, like any consumer — never a path into the add-on's src.
// Four scenes for the four ways a game gets a face: all faces at once (the skin), a tumble in place
// with the result from any of the three sources (a seed, a given number, the game's rng), a throw
// by script with a given result (the server said 17), and a throw by hand — drag and let go with
// momentum, the finger's speed becomes the slide.

import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  byId,
  Container,
  DEFAULT_TUNING,
  freeLayout,
  gridLayout,
  installStockCarries,
  node,
  rect,
  registerLayout,
  registerSurface,
  Surfaced,
  Transformable,
  type Node,
} from "../../src/index.js";
import { DIE_KINDS, die, dieSpec, rollDie, throwDie, throwFromCarry, wallsOf, type DieKind, type Outcome } from "@game-presets/dice";
import { wireDrag } from "../devtools/drag.js";
import { scene, type Scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

installStockCarries();

const meta: Meta = {
  title: "Add-ons/Dice",
  parameters: { gkDoc: "dice.component" },
};
export default meta;

const KIND = documented("arg.kind", { control: "select", options: DIE_KINDS }, "die");
const OUTCOME = documented("arg.outcome", { control: "select", options: ["seed", "given", "rng"] }, "outcome");
const SEED = documented("arg.seed", { control: { type: "number", step: 1 } }, "outcome");
const GIVEN = documented("arg.given", { control: { type: "number", min: 1, max: 20, step: 1 } }, "outcome");

/** The `Outcome` a story's three controls describe — the one door, in the add-on's own words. */
function outcomeOf(a: { outcome: string; seed: number; given: number }): Outcome {
  return a.outcome === "seed" ? { seed: a.seed } : a.outcome === "given" ? a.given : { rng: Math.random };
}

/** What each standing scene last saw — the trigger, how many taps it has had, and the face its die stands on. */
const LAST = new WeakMap<HTMLElement, { trigger: number; taps: number; face?: number }>();
const LIVE_EL = new Map<string, HTMLElement>();
/** What a tap on each scene does RIGHT NOW — the newest render's throw. Looked up at touch time. */
const TAP = new Map<string, () => void>();

function tray(w = 6, h = 3.6): Node {
  registerSurface("story.dice.tray", { layers: [{ paint: "panelBg", opacity: 0.35 }], radius: 0.12, stroke: { color: "panelBorder", width: 0.03 } });
  return node("tray", Bounded({ bounds: rect(w, h) }), Container({ layout: "story.dice.free" }), Surfaced({ surface: "story.dice.tray" }), Transformable({ at: { x: 0, y: 0 } }));
}

// ---- faces ------------------------------------------------------------------------------------

/** EVERY FACE OF EVERY KIND — the classic skin laid out: four, six and twenty faces, as the add-on draws them. */
export const Faces: StoryObj = {
  render: () => {
    registerLayout("story.dice.free", freeLayout);
    registerLayout("story.dice.grid", gridLayout({ columns: 10, gap: 0.12 }));
    const desk = node("desk", Container({ layout: "story.dice.free" }));
    let y = -2.4;
    for (const kind of DIE_KINDS) {
      const row = node(`row-${kind}`, Container({ layout: "story.dice.grid" }), Transformable({ at: { x: 0, y } }));
      add(desk, row);
      for (let v = 1; v <= dieSpec(kind).sides; v++) add(row, die(`${kind}-${v}`, { kind, face: v }));
      y += kind === "d20" ? 2.2 : 1.3;
    }
    return scene(desk).el;
  },
  parameters: { gkDocStory: "dice.faces" },
};

// ---- roll -------------------------------------------------------------------------------------

interface RollArgs {
  kind: DieKind;
  rolled: number;
  outcome: string;
  seed: number;
  given: number;
  rollMs: number;
}

/**
 * A TUMBLE IN PLACE, WITH THE RESULT FROM ANY DOOR. `outcome` picks where the face comes from —
 * `seed` (every client sharing the seed lands the same face), `given` (the server said, the test
 * pins, the cheat wants), `rng` (the game's own chance). TAP THE DIE to roll it; on the panel,
 * `rolled` does the same. The face is decided the moment the roll is asked, and the die shows face
 * after face on the way there — the result being the last of them, landed while it still turns.
 * A tap walks the seed on (`seed + taps`), so tapping keeps drawing a new face; `rolled` does not,
 * and re-rolling the same seed lands the same face, which is the point of the seed.
 */
export const Roll: StoryObj<RollArgs> = {
  render: (a) => {
    registerLayout("story.dice.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.dice.free" }));
    const el = LIVE_EL.get("roll");
    const face = el ? LAST.get(el)?.face : undefined;
    add(desk, die("die", { kind: a.kind, at: { x: 0, y: 0 }, ...(face && face <= dieSpec(a.kind).sides ? { face } : {}) }));
    // The tap is wired ONCE, with the scene, and plays whatever the newest render left behind.
    const s: Scene = scene(desk, {
      animate: true,
      motion: { rollMs: a.rollMs },
      tap: (hit) => {
        if (hit) TAP.get("roll")?.();
      },
    });
    LIVE_EL.set("roll", s.el);
    const before = LAST.get(s.el);
    const taps = before?.taps ?? 0;
    LAST.set(s.el, { trigger: a.rolled, taps, ...(face !== undefined ? { face } : {}) });
    const fire = (nth: number): void => {
      const live = byId(s.host.root, "die");
      if (!live || !s.motions) return;
      rollDie(s.motions, live, {
        outcome: outcomeOf({ ...a, seed: a.seed + nth }),
        onFace: (f) => LAST.set(s.el, { ...(LAST.get(s.el) ?? { trigger: a.rolled, taps: nth }), face: f }),
      });
    };
    TAP.set("roll", () => {
      const nth = (LAST.get(s.el)?.taps ?? 0) + 1;
      LAST.set(s.el, { ...(LAST.get(s.el) ?? { trigger: a.rolled }), taps: nth });
      fire(nth);
    });
    if (before && before.trigger !== a.rolled) fire(taps);
    return s.el;
  },
  args: { kind: "d6", rolled: 0, outcome: "seed", seed: 7, given: 6, rollMs: DEFAULT_TUNING.rollMs },
  argTypes: {
    kind: KIND,
    rolled: documented("arg.rolled", { control: { type: "number", min: 0, step: 1 } }, "motion"),
    outcome: OUTCOME,
    seed: SEED,
    given: GIVEN,
    rollMs: documented("arg.rollMs", { control: { type: "range", min: 100, max: 3000, step: 50 } }, "roll"),
  },
  parameters: { gkDocStory: "dice.roll" },
};

// ---- script -----------------------------------------------------------------------------------

interface ScriptArgs {
  kind: DieKind;
  thrown: number;
  outcome: string;
  seed: number;
  given: number;
  speed: number;
  angle: number;
  spin: number;
  friction: number;
  spinFriction: number;
  bounce: number;
}

/**
 * A THROW BY SCRIPT — what a game does on "the server rolled 17": `throwDie` slides the die across
 * the tray on the engine's ballistics (the walls are the tray's own footprint), spinning and slowing
 * by the tuning's `friction`/`spinFriction`/`bounce`, and when it stops the seat is WRITTEN into the
 * tree. The face goes over on the die's OWN travel the whole way — a new one every half unit slid
 * and every 60° spun — so the flicker dies out with the slide and the result is the last face,
 * shown before it stops. TAP THE DIE to throw it; on the panel, `thrown` does the same, and the
 * result comes from whichever door `outcome` names (a tap walks the seed on).
 */
export const Script: StoryObj<ScriptArgs> = {
  render: (a) => {
    registerLayout("story.dice.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.dice.free" }));
    const t = tray();
    add(desk, t);
    const el = LIVE_EL.get("script");
    const seen = el ? LAST.get(el) : undefined;
    add(t, die("die", { kind: a.kind, at: { x: -2.2, y: 0 }, ...(seen?.face && seen.face <= dieSpec(a.kind).sides ? { face: seen.face } : {}) }));
    const { kind: _k, thrown: _t, outcome: _o, seed: _s, given: _g, speed, angle, spin, ...motion } = a;
    const s: Scene = scene(desk, {
      animate: true,
      motion,
      tap: (hit) => {
        if (hit) TAP.get("script")?.();
      },
    });
    LIVE_EL.set("script", s.el);
    const before = LAST.get(s.el);
    const taps = before?.taps ?? 0;
    LAST.set(s.el, { trigger: a.thrown, taps, ...(seen?.face !== undefined ? { face: seen.face } : {}) });
    const fire = (nth: number): void => {
      const live = byId(s.host.root, "die");
      const liveTray = byId(s.host.root, "tray");
      if (!live || !liveTray || !s.motions) return;
      throwDie(s.motions, s.host.root, live, {
        speed,
        angle,
        spin,
        walls: wallsOf(s.host.root, liveTray, 0.5),
        outcome: outcomeOf({ ...a, seed: a.seed + nth }),
        onRest: (f) => LAST.set(s.el, { ...(LAST.get(s.el) ?? { trigger: a.thrown, taps: nth }), face: f }),
      });
    };
    TAP.set("script", () => {
      const nth = (LAST.get(s.el)?.taps ?? 0) + 1;
      LAST.set(s.el, { ...(LAST.get(s.el) ?? { trigger: a.thrown }), taps: nth });
      fire(nth);
    });
    if (before && before.trigger !== a.thrown) fire(taps);
    return s.el;
  },
  args: {
    kind: "d20",
    thrown: 0,
    outcome: "given",
    seed: 7,
    given: 17,
    speed: 9,
    angle: 15,
    spin: 900,
    friction: DEFAULT_TUNING.friction,
    spinFriction: DEFAULT_TUNING.spinFriction,
    bounce: DEFAULT_TUNING.bounce,
  },
  argTypes: {
    kind: KIND,
    thrown: documented("arg.thrown", { control: { type: "number", min: 0, step: 1 } }, "motion"),
    outcome: OUTCOME,
    seed: SEED,
    given: GIVEN,
    speed: documented("arg.throw.speed", { control: { type: "range", min: 0, max: 20, step: 0.5 } }, "throw"),
    angle: documented("arg.throw.angle", { control: { type: "range", min: 0, max: 360, step: 5 } }, "throw"),
    spin: documented("arg.throw.spin", { control: { type: "range", min: 0, max: 1440, step: 30 } }, "throw"),
    friction: documented("arg.friction", { control: { type: "range", min: 0, max: 30, step: 0.5 } }, "slide"),
    spinFriction: documented("arg.spinFriction", { control: { type: "range", min: 0, max: 2000, step: 20 } }, "slide"),
    bounce: documented("arg.bounce", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "slide"),
  },
  parameters: { gkDocStory: "dice.script" },
};

// ---- throw by hand ----------------------------------------------------------------------------

interface ThrowArgs {
  kind: DieKind;
  outcome: string;
  seed: number;
  given: number;
  gain: number;
  friction: number;
  spinFriction: number;
  bounce: number;
}

/**
 * A THROW BY HAND — drag the die and LET GO WHILE MOVING: the carry spring's speed at release
 * becomes the slide's (`throwFromCarry`), scaled by `gain`; a slow release is a drop and the die
 * stays put. The tray's walls keep it in; the face comes from the `outcome` door as always.
 */
export const Throw: StoryObj<ThrowArgs> = {
  render: (a) => {
    registerLayout("story.dice.free", freeLayout);
    const desk = node("desk", Container({ layout: "story.dice.free" }));
    const t = tray();
    add(desk, t);
    const el = LIVE_EL.get("throw");
    const seen = el ? LAST.get(el) : undefined;
    add(t, die("die", { kind: a.kind, at: { x: -1.5, y: 0 }, ...(seen?.face && seen.face <= dieSpec(a.kind).sides ? { face: seen.face } : {}) }));
    const { kind: _k, outcome: _o, seed: _s, given: _g, gain, ...motion } = a;
    const s: Scene = wireDrag(scene(desk, { animate: true, motion }), {
      onRelease: (_v, items) => {
        const live = byId(s.host.root, items[0]?.id ?? "die");
        const liveTray = byId(s.host.root, "tray");
        if (!live || !liveTray || !s.motions) return false;
        const face = throwFromCarry(s.motions, s.host.root, live, {
          gain,
          walls: wallsOf(s.host.root, liveTray, 0.5),
          outcome: outcomeOf(a),
          onRest: (f) => LAST.set(s.el, { trigger: 0, taps: 0, face: f }),
        });
        return face !== undefined; // flew — the wiring leaves it to the clock; a drop falls through
      },
    });
    LIVE_EL.set("throw", s.el);
    if (!LAST.has(s.el)) LAST.set(s.el, { trigger: 0, taps: 0 });
    return s.el;
  },
  args: { kind: "d6", outcome: "rng", seed: 7, given: 4, gain: 1, friction: DEFAULT_TUNING.friction, spinFriction: DEFAULT_TUNING.spinFriction, bounce: DEFAULT_TUNING.bounce },
  argTypes: {
    kind: KIND,
    outcome: OUTCOME,
    seed: SEED,
    given: GIVEN,
    gain: documented("arg.gain", { control: { type: "range", min: 0.2, max: 3, step: 0.1 } }, "throw"),
    friction: documented("arg.friction", { control: { type: "range", min: 0, max: 30, step: 0.5 } }, "slide"),
    spinFriction: documented("arg.spinFriction", { control: { type: "range", min: 0, max: 2000, step: 20 } }, "slide"),
    bounce: documented("arg.bounce", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "slide"),
  },
  parameters: { gkDocStory: "dice.throw" },
};
