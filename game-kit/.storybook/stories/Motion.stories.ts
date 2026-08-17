// ENGINE / MOTION — THE ONE STAND FOR EVERY NUMBER OF FEEL. game-kit moves things on one clock —
// a settle to a moved seat, a turn-over, a shuffle, a die's tumble, a card on a spring under the
// finger, a body thrown down the screen or across the desk — and every number that decides how any
// of it FEELS is a field of one flat record, `MotionTuning`. This page is that record, field by
// field: each control below is named after the field it is, and its value is handed to the clock
// as it stands (`scene(desk, { animate: true, motion })`, then `retune` on every change) — nothing
// translates between the panel and the engine, which is what `guard.every-tuning-field-has-a-control`
// holds. Above all of it sits the viewer's speed — the header's ▶ ladder — the onlooker's own knob.
//
// No timers, no per-story ticker — the reader drives every motion by flipping a control.

import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  Bounded,
  byId,
  Container,
  DEFAULT_TUNING,
  Draggable,
  Flippable,
  freeLayout,
  installStockCarries,
  installStockFlips,
  installStockShuffles,
  node,
  permutation,
  rect,
  registerLayout,
  registerSurface,
  reorder,
  rowLayout,
  seededRng,
  setFacing,
  shuffleNames,
  Surfaced,
  Transformable,
  type Node,
} from "../../src/index.js";
import { runBelow, wireDrag } from "../devtools/drag.js";
import { scene, type Scene } from "../devtools/scene.js";
import { documented } from "./surfaceControls.js";

installStockCarries();
installStockFlips();
installStockShuffles();

const meta: Meta = {
  title: "Engine/Motion",
  parameters: {
    gkDoc: "motion.component",
    // THE TUNING RECORD, field by field → the scenes where each field is a control under its own
    // name. The guard reads this against `DEFAULT_TUNING`: a field added to the engine without a
    // control here fails on the day it is added.
    gkTuning: {
      settleMs: ["Settle", "Deal", "Carry"],
      settleEase: ["Settle", "Deal", "Carry"],
      flipMs: ["Flip"],
      flipEase: ["Flip"],
      shuffleMs: ["Shuffle"],
      rollMs: ["Roll"],
      carry: ["Carry"],
      lift: ["Carry"],
      followStiffness: ["Carry"],
      followDamping: ["Carry"],
      liftStiffness: ["Carry"],
      liftDamping: ["Carry"],
      leanFactor: ["Carry"],
      leanMaxDeg: ["Carry"],
      gravity: ["Launch"],
      bounce: ["Launch", "Slide"],
      friction: ["Slide"],
      spinFriction: ["Slide"],
    },
  },
};
export default meta;

const EASES = ["easeOut", "linear"];

// The controls, one per field of the tuning, each documented once and shared by the scenes that
// carry it — so a field's description is written once and its range does not drift between pages.
const settleMs = documented("arg.settleMs", { control: { type: "range", min: 0, max: 1200, step: 10 } }, "settle");
const settleEase = documented("arg.settleEase", { control: "select", options: EASES }, "settle");
const flipMs = documented("arg.flipMs", { control: { type: "range", min: 0, max: 1200, step: 10 } }, "flip");
const flipEase = documented("arg.flipEase", { control: "select", options: EASES }, "flip");
const shuffleMs = documented("arg.shuffleMs", { control: { type: "range", min: 100, max: 3000, step: 50 } }, "shuffle");
const rollMs = documented("arg.rollMs", { control: { type: "range", min: 100, max: 3000, step: 50 } }, "roll");
const carry = documented("arg.carry", { control: "select", options: ["rigid", "loose"] }, "carry");
const lift = documented("arg.lift", { control: { type: "range", min: 1, max: 1.3, step: 0.01 } }, "carry");
const followStiffness = documented("arg.followStiffness", { control: { type: "range", min: 10, max: 600, step: 5 } }, "carry/follow");
const followDamping = documented("arg.followDamping", { control: { type: "range", min: 1, max: 60, step: 1 } }, "carry/follow");
const liftStiffness = documented("arg.liftStiffness", { control: { type: "range", min: 10, max: 600, step: 5 } }, "carry/lift");
const liftDamping = documented("arg.liftDamping", { control: { type: "range", min: 1, max: 60, step: 1 } }, "carry/lift");
const leanFactor = documented("arg.leanFactor", { control: { type: "range", min: 0, max: 10, step: 0.5 } }, "carry/lean");
const leanMaxDeg = documented("arg.leanMaxDeg", { control: { type: "range", min: 0, max: 45, step: 1 } }, "carry/lean");
const gravity = documented("arg.gravity", { control: { type: "range", min: 0, max: 40, step: 0.5 } }, "launch");
const bounce = documented("arg.bounce", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "launch");
const friction = documented("arg.friction", { control: { type: "range", min: 0, max: 30, step: 0.5 } }, "slide");
const spinFriction = documented("arg.spinFriction", { control: { type: "range", min: 0, max: 2000, step: 20 } }, "slide");
// The throw's own inputs — not tuning, the call's arguments — under the runtime's own names.
const speed = documented("arg.throw.speed", { control: { type: "range", min: 0, max: 20, step: 0.5 } }, "throw");
const angle = documented("arg.throw.angle", { control: { type: "range", min: 0, max: 360, step: 5 } }, "throw");
const spin = documented("arg.throw.spin", { control: { type: "range", min: 0, max: 1440, step: 30 } }, "throw");

/**
 * A control that TRIGGERS a motion (turn it over, throw it, shuffle) rather than describing a
 * tree: Storybook re-runs the render on every change, and the scene stands, so the render compares
 * the trigger with what it last saw and speaks to the clock only when the trigger moved.
 */
const LAST = new WeakMap<HTMLElement, Record<string, unknown>>();
function moved(s: Scene, key: string, value: unknown): boolean {
  const seen = LAST.get(s.el) ?? {};
  const was = key in seen;
  const changed = was && seen[key] !== value;
  LAST.set(s.el, { ...seen, [key]: value });
  return changed;
}

function piece(id: string, x: number, y: number, surface = "story.motion.piece"): Node {
  return node(id, Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface }), Transformable({ at: { x, y } }));
}
function surfaces(): void {
  registerSurface("story.motion.piece", { layers: [{ paint: "accent" }], radius: 0.08 });
  registerSurface("story.motion.back", { layers: [{ paint: "sunkBg" }], radius: 0.08 });
  registerSurface("story.motion.token", { layers: [{ paint: "textMuted" }], radius: 0.5 });
  registerLayout("story.motion.free", freeLayout);
  registerLayout("story.motion.row", rowLayout({ gap: 0.25 }));
}

// ---- settle -----------------------------------------------------------------------------------

interface SettleArgs {
  right: boolean;
  settleMs: number;
  settleEase: string;
}

/** A single token that eases between a left slot and a right one — flip the control and watch it go. */
export const Settle: StoryObj<SettleArgs> = {
  args: { right: false, settleMs: DEFAULT_TUNING.settleMs, settleEase: DEFAULT_TUNING.settleEase },
  argTypes: { right: documented("arg.right", { control: "boolean" }, "motion"), settleMs, settleEase },
  parameters: { gkDocStory: "motion.settle" },
  render: (a) => {
    surfaces();
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    add(desk, piece("token", a.right ? 2.4 : -2.4, 0));
    const { right: _right, ...motion } = a;
    return scene(desk, { animate: true, motion }).el;
  },
};

// ---- deal -------------------------------------------------------------------------------------

interface DealArgs {
  dealt: boolean;
  settleMs: number;
  settleEase: string;
}

/** A stacked pack that fans into a row on deal — every card keeps its identity and springs to its seat. */
export const Deal: StoryObj<DealArgs> = {
  args: { dealt: false, settleMs: DEFAULT_TUNING.settleMs, settleEase: DEFAULT_TUNING.settleEase },
  argTypes: { dealt: documented("arg.dealt", { control: "boolean" }, "motion"), settleMs, settleEase },
  parameters: { gkDocStory: "motion.deal" },
  render: (a) => {
    surfaces();
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    const count = 5;
    for (let i = 0; i < count; i++) {
      // Stacked: all near the origin with a hair of drift. Dealt: spread evenly across a row.
      const x = a.dealt ? (i - (count - 1) / 2) * 1.3 : i * 0.04;
      const y = a.dealt ? 0 : i * 0.04;
      add(desk, piece(`card:${i}`, x, y));
    }
    const { dealt: _dealt, ...motion } = a;
    return scene(desk, { animate: true, motion }).el;
  },
};

// ---- flip -------------------------------------------------------------------------------------

interface FlipArgs {
  turned: boolean;
  flipMs: number;
  flipEase: string;
}

/**
 * ONE CARD, TURNED OVER ON THE CLOCK. `turned` is the trigger: the render tells the clock to `flip`,
 * and the side swaps at the edge — where the card has no width to show it. `flipMs` and `flipEase`
 * are the turn's own numbers, apart from the settle's.
 */
export const Flip: StoryObj<FlipArgs> = {
  args: { turned: false, flipMs: DEFAULT_TUNING.flipMs, flipEase: DEFAULT_TUNING.flipEase },
  argTypes: { turned: documented("arg.turned", { control: "boolean" }, "motion"), flipMs, flipEase },
  parameters: { gkDocStory: "motion.flip" },
  render: (a) => {
    surfaces();
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    // The tree is fed with the side the card is ON — the trigger's LAST value — so feeding it moves
    // nothing; the turn itself is the clock's, below. First render: whatever the control says.
    const el = LIVE_EL.get("flip");
    const seenTurned = el ? (LAST.get(el)?.["turned"] as boolean | undefined) : undefined;
    const showing = seenTurned ?? a.turned;
    add(
      desk,
      node(
        "card",
        Bounded({ bounds: rect(1.2, 1.7) }),
        Surfaced({ surface: "story.motion.piece" }),
        Flippable({ flip: "turnOver", back: "story.motion.back", turns: showing ? 1 : 0 }),
        Transformable({ at: { x: 0, y: 0 } }),
      ),
    );
    const { turned: _turned, ...motion } = a;
    const s = scene(desk, { animate: true, motion });
    LIVE_EL.set("flip", s.el);
    if (moved(s, "turned", a.turned)) {
      const live = byId(s.host.root, "card");
      if (live) s.motions?.flip("card", () => setFacing(live, a.turned ? "down" : "up"));
    }
    return s.el;
  },
};
/** The standing element per trigger story, so a render can read what the trigger last was. */
const LIVE_EL = new Map<string, HTMLElement>();

// ---- carry ------------------------------------------------------------------------------------

interface CarryArgs {
  carry: string;
  lift: number;
  followStiffness: number;
  followDamping: number;
  liftStiffness: number;
  liftDamping: number;
  leanFactor: number;
  leanMaxDeg: number;
  settleMs: number;
  settleEase: string;
}

/**
 * A COLUMN UNDER YOUR OWN FINGER — every number of the carry on one panel. Grab any card and it leads
 * the run below it; the springs chase your pointer (`follow*` is the lag), the lift pops
 * (`lift*`), the lean banks into speed (`lean*`), the style says how the run composes (`carry`).
 * Let go anywhere: nothing here accepts a drop, so the run flies home on the settle (`settle*`).
 */
export const Carry: StoryObj<CarryArgs> = {
  args: {
    carry: DEFAULT_TUNING.carry,
    lift: DEFAULT_TUNING.lift,
    followStiffness: DEFAULT_TUNING.followStiffness,
    followDamping: DEFAULT_TUNING.followDamping,
    liftStiffness: DEFAULT_TUNING.liftStiffness,
    liftDamping: DEFAULT_TUNING.liftDamping,
    leanFactor: DEFAULT_TUNING.leanFactor,
    leanMaxDeg: DEFAULT_TUNING.leanMaxDeg,
    settleMs: DEFAULT_TUNING.settleMs,
    settleEase: DEFAULT_TUNING.settleEase,
  },
  argTypes: { carry, lift, followStiffness, followDamping, liftStiffness, liftDamping, leanFactor, leanMaxDeg, settleMs, settleEase },
  parameters: { gkDocStory: "motion.carry" },
  render: (a) => {
    surfaces();
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    for (const [i, paint] of (["accent", "alert", "textMuted", "panelBg"] as const).entries()) {
      registerSurface(`story.motion.run.${paint}`, { layers: [{ paint }], radius: 0.08 });
      add(
        desk,
        node(
          `card#${i}`,
          Bounded({ bounds: rect(1, 1.4) }),
          Surfaced({ surface: `story.motion.run.${paint}` }),
          Transformable({ at: { x: -0.9, y: -0.9 + i * 0.55 } }),
          Draggable(),
        ),
      );
    }
    // The whole record goes to the clock; the carry fields ALSO go to the wiring, which hands them
    // to `grab` — the per-gesture patch a game would write.
    return wireDrag(scene(desk, { animate: true, motion: a }), { ...a, runOf: runBelow }).el;
  },
};

// ---- launch -----------------------------------------------------------------------------------

interface LaunchArgs {
  launched: boolean;
  retain: boolean;
  speed: number;
  angle: number;
  spin: number;
  gravity: number;
  bounce: number;
}

/**
 * A THROW DOWN THE SCREEN. `launched` is the trigger: the card leaves its seat with `speed` along
 * `angle` (270 is straight up), `gravity` pulls it, the bottom edge of the glass bounces it back by
 * `bounce`, and once it is off the glass it eases home. `retain` keeps every frame on the glass —
 * the trail of the old solitaire's victory cascade.
 */
export const Launch: StoryObj<LaunchArgs> = {
  args: { launched: false, retain: false, speed: 6, angle: 300, spin: 180, gravity: DEFAULT_TUNING.gravity, bounce: DEFAULT_TUNING.bounce },
  argTypes: {
    launched: documented("arg.launched", { control: "boolean" }, "motion"),
    retain: documented("arg.retain", { control: "boolean" }, "motion"),
    speed,
    angle,
    spin,
    gravity,
    bounce,
  },
  parameters: { gkDocStory: "motion.launch" },
  render: (a) => {
    surfaces();
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    add(desk, piece("card", -1.5, 1.2));
    add(desk, piece("wall", 1.5, 0, "story.motion.back"));
    const { launched: _l, retain: _r, speed: sp, angle: an, spin: spn, ...motion } = a;
    const s = scene(desk, { animate: true, motion });
    s.motions?.retain(a.retain);
    if (moved(s, "launched", a.launched)) s.motions?.launch("card", { speed: sp, angle: an, spin: spn });
    return s.el;
  },
};

// ---- slide ------------------------------------------------------------------------------------

interface SlideArgs {
  thrown: boolean;
  speed: number;
  angle: number;
  spin: number;
  friction: number;
  spinFriction: number;
  bounce: number;
}

/**
 * A THROW ACROSS THE DESK, seen from above: no gravity, `friction` bleeds the speed and `spinFriction`
 * the spin, the tray's walls reflect by `bounce`, and where it stops it stops — then, since this
 * scene writes nothing into the tree, it eases home. A die's throw is exactly this with a face at
 * the end (`Add-ons/Dice`).
 */
export const Slide: StoryObj<SlideArgs> = {
  args: { thrown: false, speed: 8, angle: 20, spin: 720, friction: DEFAULT_TUNING.friction, spinFriction: DEFAULT_TUNING.spinFriction, bounce: DEFAULT_TUNING.bounce },
  argTypes: { thrown: documented("arg.thrown", { control: "boolean" }, "motion"), speed, angle, spin, friction, spinFriction, bounce },
  parameters: { gkDocStory: "motion.slide" },
  render: (a) => {
    surfaces();
    registerSurface("story.motion.tray", { layers: [{ paint: "panelBg", opacity: 0.35 }], radius: 0.12, stroke: { color: "panelBorder", width: 0.03 } });
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    add(desk, node("tray", Bounded({ bounds: rect(6, 3.6) }), Surfaced({ surface: "story.motion.tray" }), Transformable({ at: { x: 0, y: 0 } })));
    add(desk, node("puck", Bounded({ bounds: rect(0.9, 0.9) }), Surfaced({ surface: "story.motion.token" }), Transformable({ at: { x: -2, y: 0 } })));
    const { thrown: _t, speed: sp, angle: an, spin: spn, ...motion } = a;
    const s = scene(desk, { animate: true, motion });
    if (moved(s, "thrown", a.thrown)) {
      // The tray's inner box, in root units (the tray is at the origin, unposed): a puck of 0.9 stays inside by half its width.
      const walls = { x0: -3 + 0.45, y0: -1.8 + 0.45, x1: 3 - 0.45, y1: 1.8 - 0.45 };
      s.motions?.slide("puck", { speed: sp, angle: an, spin: spn, walls });
    }
    return s.el;
  },
};

// ---- shuffle ----------------------------------------------------------------------------------

interface ShuffleArgs {
  shuffled: number;
  recipe: string;
  seed: number;
  shuffleMs: number;
}

/**
 * A ROW REORDERED ON THE CLOCK. `shuffled` is the trigger (bump it and the row shuffles again);
 * `seed` decides the ORDER — the truth, `reorder(hand, permutation(n, seededRng(seed)))`, the same
 * on every client that shares the seed — and `recipe` decides the LOOK, and never sees the seed.
 */
export const Shuffle: StoryObj<ShuffleArgs> = {
  args: { shuffled: 0, recipe: "riffle", seed: 7, shuffleMs: DEFAULT_TUNING.shuffleMs },
  argTypes: {
    shuffled: documented("arg.shuffled", { control: { type: "number", min: 0, step: 1 } }, "motion"),
    recipe: documented("arg.recipe", { control: "select", options: shuffleNames() }, "shuffle"),
    seed: documented("arg.seed", { control: { type: "number", step: 1 } }, "shuffle"),
    shuffleMs,
  },
  parameters: { gkDocStory: "motion.shuffle" },
  render: (a) => {
    surfaces();
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    // The row keeps whatever order the LAST shuffle left it in: the tree fed on a re-render is the
    // standing one's order, so a slider move does not un-shuffle it.
    const el = LIVE_EL.get("shuffle");
    const standingOrder = el ? (LAST.get(el)?.["order"] as readonly number[] | undefined) : undefined;
    const hand = node("hand", Container({ layout: "story.motion.row" }), Transformable({ at: { x: 0, y: 0 } }));
    add(desk, hand);
    const paints = ["accent", "alert", "textMuted", "panelBg", "sunkBg", "accent"] as const;
    for (let i = 0; i < 6; i++) {
      registerSurface(`story.motion.shuffle.${i}`, { layers: [{ paint: paints[i]! }], radius: 0.08 });
      add(hand, node(`c${i}`, Bounded({ bounds: rect(0.9, 1.3) }), Surfaced({ surface: `story.motion.shuffle.${i}` })));
    }
    if (standingOrder && standingOrder.length === 6) reorder(hand, standingOrder);
    const { shuffled: _s, recipe, seed, ...motion } = a;
    const s = scene(desk, { animate: true, motion });
    LIVE_EL.set("shuffle", s.el);
    if (moved(s, "shuffled", a.shuffled)) {
      const live = byId(s.host.root, "hand");
      if (live) {
        const order = permutation(live.children.length, seededRng(seed + a.shuffled));
        // Remember the order the row will stand in, composed over what it stood in before.
        const before = (LAST.get(s.el)?.["order"] as readonly number[] | undefined) ?? [0, 1, 2, 3, 4, 5];
        LAST.set(s.el, { ...LAST.get(s.el), order: order.map((i) => before[i]!) });
        s.motions?.shuffle("hand", () => reorder(live, order), { recipe });
      }
    }
    return s.el;
  },
};

// ---- roll -------------------------------------------------------------------------------------

interface RollArgs {
  rolled: number;
  turns: number;
  hop: number;
  rollMs: number;
}

/**
 * A TUMBLE IN PLACE — the look of a die rolled without being thrown: `turns` whole turns about its
 * centre and a `hop` (a scale peak) over `rollMs`, with the commit (a die's new face) late in the
 * tumble. Bump `rolled` to tumble again. What it commits is the game's business; here, nothing.
 */
export const Roll: StoryObj<RollArgs> = {
  args: { rolled: 0, turns: 2, hop: 1.25, rollMs: DEFAULT_TUNING.rollMs },
  argTypes: {
    rolled: documented("arg.rolled", { control: { type: "number", min: 0, step: 1 } }, "motion"),
    turns: documented("arg.roll.turns", { control: { type: "range", min: 0, max: 6, step: 0.5 } }, "roll"),
    hop: documented("arg.roll.hop", { control: { type: "range", min: 1, max: 2, step: 0.05 } }, "roll"),
    rollMs,
  },
  parameters: { gkDocStory: "motion.roll" },
  render: (a) => {
    surfaces();
    const desk = node("desk", Container({ layout: "story.motion.free" }));
    add(desk, node("token", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "story.motion.token" }), Transformable({ at: { x: 0, y: 0 } })));
    const { rolled: _r, turns, hop, ...motion } = a;
    const s = scene(desk, { animate: true, motion });
    if (moved(s, "rolled", a.rolled)) s.motions?.roll("token", () => undefined, { turns, hop });
    return s.el;
  },
};
