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
//
// Beside the tuning stands the SCENE: the desk's arrangement, the box every piece wears, the record
// it is painted with and the seats it starts from. Those are the catalog's own numbers, not the
// engine's, so they sit in their own groups — a piece's box under `pieces/bounds`, its record under
// `pieces/surface` — and never inside the record handed to the clock.

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
import { documented, PAINTS } from "./surfaceControls.js";

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
      leanStiffness: ["Carry"],
      leanDamping: ["Carry"],
      gravity: ["Launch"],
      bounce: ["Launch", "Slide"],
      friction: ["Slide"],
      spinFriction: ["Slide"],
    },
  },
};
export default meta;

const EASES = ["easeOut", "linear"];

const SIZE = { control: { type: "number", min: 0, step: 0.1 } };
const PLACE = { control: { type: "number", step: 0.1 } };
const RADIUS = { control: { type: "number", min: 0, step: 0.02 } };
const PAINT = { control: "select", options: PAINTS };
const TOKEN = { control: "text" };

// The controls, one per field of the tuning, each documented once and shared by the scenes that
// carry it — so a field's description is written once and its range does not drift between pages.
const settleMs = documented("arg.settleMs", { control: { type: "range", min: 0, max: 1200, step: 10 } }, "tuning/settle");
const settleEase = documented("arg.settleEase", { control: "select", options: EASES }, "tuning/settle");
const flipMs = documented("arg.flipMs", { control: { type: "range", min: 0, max: 1200, step: 10 } }, "tuning/flip");
const flipEase = documented("arg.flipEase", { control: "select", options: EASES }, "tuning/flip");
const shuffleMs = documented("arg.shuffleMs", { control: { type: "range", min: 100, max: 3000, step: 50 } }, "tuning/shuffle");
const rollMs = documented("arg.rollMs", { control: { type: "range", min: 100, max: 3000, step: 50 } }, "tuning/roll");
const carry = documented("arg.carry", { control: "select", options: ["rigid", "loose"] }, "tuning/carry");
const lift = documented("arg.lift", { control: { type: "range", min: 1, max: 1.3, step: 0.01 } }, "tuning/carry");
const followStiffness = documented("arg.followStiffness", { control: { type: "range", min: 10, max: 600, step: 5 } }, "tuning/carry.follow");
const followDamping = documented("arg.followDamping", { control: { type: "range", min: 1, max: 60, step: 1 } }, "tuning/carry.follow");
const liftStiffness = documented("arg.liftStiffness", { control: { type: "range", min: 10, max: 600, step: 5 } }, "tuning/carry.lift");
const liftDamping = documented("arg.liftDamping", { control: { type: "range", min: 1, max: 60, step: 1 } }, "tuning/carry.lift");
const leanFactor = documented("arg.leanFactor", { control: { type: "range", min: 0, max: 10, step: 0.5 } }, "tuning/carry.lean");
const leanMaxDeg = documented("arg.leanMaxDeg", { control: { type: "range", min: 0, max: 45, step: 1 } }, "tuning/carry.lean");
const leanStiffness = documented("arg.leanStiffness", { control: { type: "range", min: 10, max: 600, step: 5 } }, "tuning/carry.lean");
const leanDamping = documented("arg.leanDamping", { control: { type: "range", min: 1, max: 60, step: 1 } }, "tuning/carry.lean");
const gravity = documented("arg.gravity", { control: { type: "range", min: 0, max: 40, step: 0.5 } }, "tuning/launch");
const bounce = documented("arg.bounce", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "tuning/launch");
const friction = documented("arg.friction", { control: { type: "range", min: 0, max: 30, step: 0.5 } }, "tuning/slide");
const spinFriction = documented("arg.spinFriction", { control: { type: "range", min: 0, max: 2000, step: 20 } }, "tuning/slide");
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

function piece(id: string, x: number, y: number, w: number, h: number, surface: string): Node {
  return node(id, Bounded({ bounds: rect(w, h) }), Surfaced({ surface }), Transformable({ at: { x, y } }));
}

/** The desk and the piece record every scene stands on — the catalog's own numbers, not the clock's. */
interface DeskArgs {
  deskLayout: string;
  pieceW: number;
  pieceH: number;
  pieceSurface: string;
  piecePaint: string;
  pieceRadius: number;
}
const DESK_ARGS: DeskArgs = {
  deskLayout: "story.motion.free",
  pieceW: 1,
  pieceH: 1.4,
  pieceSurface: "story.motion.piece",
  piecePaint: "accent",
  pieceRadius: 0.08,
};
const DESK_ARG_TYPES: Record<string, unknown> = {
  deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
  pieceW: documented("arg.w", SIZE, "pieces/bounds"),
  pieceH: documented("arg.h", SIZE, "pieces/bounds"),
  pieceSurface: documented("arg.registerAs", TOKEN, "pieces/surface"),
  piecePaint: documented("arg.fill", PAINT, "pieces/surface"),
  pieceRadius: documented("arg.radius", RADIUS, "pieces/surface"),
};

// ---- settle -----------------------------------------------------------------------------------

interface SettleArgs extends DeskArgs {
  right: boolean;
  leftX: number;
  rightX: number;
  tokenY: number;
  settleMs: number;
  settleEase: string;
}

/** A single token that eases between a left slot and a right one — flip the control and watch it go. */
export const Settle: StoryObj<SettleArgs> = {
  args: {
    ...DESK_ARGS,
    right: false,
    leftX: -2.4,
    rightX: 2.4,
    tokenY: 0,
    settleMs: DEFAULT_TUNING.settleMs,
    settleEase: DEFAULT_TUNING.settleEase,
  },
  argTypes: {
    ...DESK_ARG_TYPES,
    leftX: documented("arg.x", PLACE, "token/transformable"),
    rightX: documented("arg.x", PLACE, "token/transformable"),
    tokenY: documented("arg.y", PLACE, "token/transformable"),
    right: documented("arg.right", { control: "boolean" }, "token/motion"),
    settleMs,
    settleEase,
  },
  parameters: { gkDocStory: "motion.settle" },
  render: ({ deskLayout, pieceW, pieceH, pieceSurface, piecePaint, pieceRadius, right, leftX, rightX, tokenY, settleMs: ms, settleEase: ease }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(pieceSurface, { layers: [{ paint: piecePaint }], radius: pieceRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    add(desk, piece("token", right ? rightX : leftX, tokenY, pieceW, pieceH, pieceSurface));
    return scene(desk, { animate: true, motion: { settleMs: ms, settleEase: ease } }).el;
  },
};

// ---- deal -------------------------------------------------------------------------------------

interface DealArgs extends DeskArgs {
  dealt: boolean;
  count: number;
  stepX: number;
  driftX: number;
  driftY: number;
  settleMs: number;
  settleEase: string;
}

/** A stacked pack that fans into a row on deal — every card keeps its identity and springs to its seat. */
export const Deal: StoryObj<DealArgs> = {
  args: {
    ...DESK_ARGS,
    dealt: false,
    count: 5,
    stepX: 1.3,
    driftX: 0.04,
    driftY: 0.04,
    settleMs: DEFAULT_TUNING.settleMs,
    settleEase: DEFAULT_TUNING.settleEase,
  },
  argTypes: {
    ...DESK_ARG_TYPES,
    count: documented("arg.count", { control: { type: "range", min: 0, max: 12, step: 1 } }, "pack/children"),
    stepX: documented("arg.stepX", PLACE, "pack/transformable"),
    driftX: documented("arg.driftX", PLACE, "pack/transformable"),
    driftY: documented("arg.driftY", PLACE, "pack/transformable"),
    dealt: documented("arg.dealt", { control: "boolean" }, "pack/motion"),
    settleMs,
    settleEase,
  },
  parameters: { gkDocStory: "motion.deal" },
  render: ({ deskLayout, pieceW, pieceH, pieceSurface, piecePaint, pieceRadius, dealt, count, stepX, driftX, driftY, settleMs: ms, settleEase: ease }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(pieceSurface, { layers: [{ paint: piecePaint }], radius: pieceRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    for (let i = 0; i < count; i++) {
      // Stacked: all near the origin with a hair of drift. Dealt: spread evenly across a row.
      const x = dealt ? (i - (count - 1) / 2) * stepX : i * driftX;
      const y = dealt ? 0 : i * driftY;
      add(desk, piece(`card:${i}`, x, y, pieceW, pieceH, pieceSurface));
    }
    return scene(desk, { animate: true, motion: { settleMs: ms, settleEase: ease } }).el;
  },
};

// ---- flip -------------------------------------------------------------------------------------

interface FlipArgs extends DeskArgs {
  turned: boolean;
  cardX: number;
  cardY: number;
  flipRecipe: string;
  backSurface: string;
  backPaint: string;
  backRadius: number;
  flipMs: number;
  flipEase: string;
}

/**
 * ONE CARD, TURNED OVER ON THE CLOCK. `turned` is the trigger: the render tells the clock to `flip`,
 * and the side swaps at the edge — where the card has no width to show it. `flipMs` and `flipEase`
 * are the turn's own numbers, apart from the settle's.
 */
export const Flip: StoryObj<FlipArgs> = {
  args: {
    ...DESK_ARGS,
    pieceW: 1.2,
    pieceH: 1.7,
    turned: false,
    cardX: 0,
    cardY: 0,
    flipRecipe: "turnOver",
    backSurface: "story.motion.back",
    backPaint: "sunkBg",
    backRadius: 0.08,
    flipMs: DEFAULT_TUNING.flipMs,
    flipEase: DEFAULT_TUNING.flipEase,
  },
  argTypes: {
    ...DESK_ARG_TYPES,
    backSurface: documented("arg.registerAs", TOKEN, "card/back surface"),
    backPaint: documented("arg.fill", PAINT, "card/back surface"),
    backRadius: documented("arg.radius", RADIUS, "card/back surface"),
    cardX: documented("arg.x", PLACE, "card/transformable"),
    cardY: documented("arg.y", PLACE, "card/transformable"),
    flipRecipe: documented("arg.flip", TOKEN, "card/flippable"),
    turned: documented("arg.turned", { control: "boolean" }, "card/motion"),
    flipMs,
    flipEase,
  },
  parameters: { gkDocStory: "motion.flip" },
  render: ({
    deskLayout,
    pieceW,
    pieceH,
    pieceSurface,
    piecePaint,
    pieceRadius,
    turned,
    cardX,
    cardY,
    flipRecipe,
    backSurface,
    backPaint,
    backRadius,
    flipMs: ms,
    flipEase: ease,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(pieceSurface, { layers: [{ paint: piecePaint }], radius: pieceRadius });
    registerSurface(backSurface, { layers: [{ paint: backPaint }], radius: backRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    // The tree is fed with the side the card is ON — the trigger's LAST value — so feeding it moves
    // nothing; the turn itself is the clock's, below. First render: whatever the control says.
    const el = LIVE_EL.get("flip");
    const seenTurned = el ? (LAST.get(el)?.["turned"] as boolean | undefined) : undefined;
    const showing = seenTurned ?? turned;
    add(
      desk,
      node(
        "card",
        Bounded({ bounds: rect(pieceW, pieceH) }),
        Surfaced({ surface: pieceSurface }),
        Flippable({ flip: flipRecipe, back: backSurface, turns: showing ? 1 : 0 }),
        Transformable({ at: { x: cardX, y: cardY } }),
      ),
    );
    const s = scene(desk, { animate: true, motion: { flipMs: ms, flipEase: ease } });
    LIVE_EL.set("flip", s.el);
    if (moved(s, "turned", turned)) {
      const live = byId(s.host.root, "card");
      if (live) s.motions?.flip("card", () => setFacing(live, turned ? "down" : "up"));
    }
    return s.el;
  },
};
/** The standing element per trigger story, so a render can read what the trigger last was. */
const LIVE_EL = new Map<string, HTMLElement>();

// ---- carry ------------------------------------------------------------------------------------

/** One card of the run, written out AS a node would be — the list is the count and the paint at once. */
interface RunCard {
  readonly paint: string;
}

interface CarryArgs extends Omit<DeskArgs, "piecePaint"> {
  run: RunCard[];
  runX: number;
  runY: number;
  runStepY: number;
  carry: string;
  lift: number;
  followStiffness: number;
  followDamping: number;
  liftStiffness: number;
  liftDamping: number;
  leanFactor: number;
  leanMaxDeg: number;
  leanStiffness: number;
  leanDamping: number;
  settleMs: number;
  settleEase: string;
}

/**
 * A COLUMN UNDER YOUR OWN FINGER — every number of the carry on one panel. Grab any card and it leads
 * the run below it, 1:1 under the pointer with no trail; the chase spring reads your speed instead of
 * moving the run (`follow*`), the lift pops (`lift*`), that speed asks for a bank the run swings into
 * on a spring of its own (`lean*`), and the style says how the run composes (`carry`).
 * Let go anywhere: nothing here accepts a drop, so the run flies home on the settle (`settle*`).
 */
export const Carry: StoryObj<CarryArgs> = {
  args: {
    // The paint is the RUN's, one entry per card, so this scene declares no shared `piecePaint`.
    deskLayout: "story.motion.free",
    pieceW: 1,
    pieceH: 1.4,
    pieceSurface: "story.motion.run",
    pieceRadius: 0.08,
    run: [{ paint: "accent" }, { paint: "alert" }, { paint: "textMuted" }, { paint: "panelBg" }],
    runX: -0.9,
    runY: -0.9,
    runStepY: 0.55,
    carry: DEFAULT_TUNING.carry,
    lift: DEFAULT_TUNING.lift,
    followStiffness: DEFAULT_TUNING.followStiffness,
    followDamping: DEFAULT_TUNING.followDamping,
    liftStiffness: DEFAULT_TUNING.liftStiffness,
    liftDamping: DEFAULT_TUNING.liftDamping,
    leanFactor: DEFAULT_TUNING.leanFactor,
    leanMaxDeg: DEFAULT_TUNING.leanMaxDeg,
    leanStiffness: DEFAULT_TUNING.leanStiffness,
    leanDamping: DEFAULT_TUNING.leanDamping,
    settleMs: DEFAULT_TUNING.settleMs,
    settleEase: DEFAULT_TUNING.settleEase,
  },
  argTypes: {
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    pieceW: documented("arg.w", SIZE, "run/bounds"),
    pieceH: documented("arg.h", SIZE, "run/bounds"),
    pieceSurface: documented("arg.registerAs", TOKEN, "run/surface"),
    pieceRadius: documented("arg.radius", RADIUS, "run/surface"),
    run: documented("arg.cards", { control: "object" }, "run/children"),
    runX: documented("arg.x", PLACE, "run/transformable"),
    runY: documented("arg.y", PLACE, "run/transformable"),
    runStepY: documented("arg.stepY", PLACE, "run/transformable"),
    carry,
    lift,
    followStiffness,
    followDamping,
    liftStiffness,
    liftDamping,
    leanFactor,
    leanMaxDeg,
    leanStiffness,
    leanDamping,
    settleMs,
    settleEase,
  },
  parameters: { gkDocStory: "motion.carry" },
  render: ({
    deskLayout,
    pieceW,
    pieceH,
    pieceSurface,
    pieceRadius,
    run,
    runX,
    runY,
    runStepY,
    carry: style,
    lift: pop,
    followStiffness: followK,
    followDamping: followC,
    liftStiffness: liftK,
    liftDamping: liftC,
    leanFactor: lean,
    leanMaxDeg: leanMax,
    leanStiffness: bankK,
    leanDamping: bankC,
    settleMs: ms,
    settleEase: ease,
  }) => {
    registerLayout(deskLayout, freeLayout);
    const desk = node("desk", Container({ layout: deskLayout }));
    run.forEach(({ paint }, i) => {
      registerSurface(`${pieceSurface}#${i}`, { layers: [{ paint }], radius: pieceRadius });
      add(
        desk,
        node(
          `card#${i}`,
          Bounded({ bounds: rect(pieceW, pieceH) }),
          Surfaced({ surface: `${pieceSurface}#${i}` }),
          Transformable({ at: { x: runX, y: runY + i * runStepY } }),
          Draggable(),
        ),
      );
    });
    // The whole record goes to the clock; the carry fields ALSO go to the wiring, which hands them
    // to `grab` — the per-gesture patch a game would write.
    const motion = {
      carry: style,
      lift: pop,
      followStiffness: followK,
      followDamping: followC,
      liftStiffness: liftK,
      liftDamping: liftC,
      leanFactor: lean,
      leanMaxDeg: leanMax,
      leanStiffness: bankK,
      leanDamping: bankC,
      settleMs: ms,
      settleEase: ease,
    };
    return wireDrag(scene(desk, { animate: true, motion }), { ...motion, runOf: runBelow }).el;
  },
};

// ---- launch -----------------------------------------------------------------------------------

interface LaunchArgs extends DeskArgs {
  launched: boolean;
  retain: boolean;
  cardX: number;
  cardY: number;
  wallW: number;
  wallH: number;
  wallSurface: string;
  wallPaint: string;
  wallRadius: number;
  wallX: number;
  wallY: number;
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
  args: {
    ...DESK_ARGS,
    launched: false,
    retain: false,
    cardX: -1.5,
    cardY: 1.2,
    wallW: 1,
    wallH: 1.4,
    wallSurface: "story.motion.back",
    wallPaint: "sunkBg",
    wallRadius: 0.08,
    wallX: 1.5,
    wallY: 0,
    speed: 6,
    angle: 300,
    spin: 180,
    gravity: DEFAULT_TUNING.gravity,
    bounce: DEFAULT_TUNING.bounce,
  },
  argTypes: {
    ...DESK_ARG_TYPES,
    cardX: documented("arg.x", PLACE, "card/transformable"),
    cardY: documented("arg.y", PLACE, "card/transformable"),
    wallW: documented("arg.w", SIZE, "wall/bounds"),
    wallH: documented("arg.h", SIZE, "wall/bounds"),
    wallSurface: documented("arg.registerAs", TOKEN, "wall/surface"),
    wallPaint: documented("arg.fill", PAINT, "wall/surface"),
    wallRadius: documented("arg.radius", RADIUS, "wall/surface"),
    wallX: documented("arg.x", PLACE, "wall/transformable"),
    wallY: documented("arg.y", PLACE, "wall/transformable"),
    launched: documented("arg.launched", { control: "boolean" }, "card/motion"),
    retain: documented("arg.retain", { control: "boolean" }, "card/motion"),
    speed,
    angle,
    spin,
    gravity,
    bounce,
  },
  parameters: { gkDocStory: "motion.launch" },
  render: ({
    deskLayout,
    pieceW,
    pieceH,
    pieceSurface,
    piecePaint,
    pieceRadius,
    launched,
    retain,
    cardX,
    cardY,
    wallW,
    wallH,
    wallSurface,
    wallPaint,
    wallRadius,
    wallX,
    wallY,
    speed: throwSpeed,
    angle: throwAngle,
    spin: throwSpin,
    gravity: pull,
    bounce: rebound,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(pieceSurface, { layers: [{ paint: piecePaint }], radius: pieceRadius });
    registerSurface(wallSurface, { layers: [{ paint: wallPaint }], radius: wallRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    add(desk, piece("card", cardX, cardY, pieceW, pieceH, pieceSurface));
    add(desk, piece("wall", wallX, wallY, wallW, wallH, wallSurface));
    const s = scene(desk, { animate: true, motion: { gravity: pull, bounce: rebound } });
    s.motions?.retain(retain);
    if (moved(s, "launched", launched)) s.motions?.launch("card", { speed: throwSpeed, angle: throwAngle, spin: throwSpin });
    return s.el;
  },
};

// ---- slide ------------------------------------------------------------------------------------

interface SlideArgs {
  deskLayout: string;
  thrown: boolean;
  trayW: number;
  trayH: number;
  traySurface: string;
  trayPaint: string;
  trayOpacity: number;
  trayRadius: number;
  trayStrokeColor: string;
  trayStrokeWidth: number;
  trayX: number;
  trayY: number;
  puckW: number;
  puckH: number;
  puckSurface: string;
  puckPaint: string;
  puckRadius: number;
  puckX: number;
  puckY: number;
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
  args: {
    deskLayout: "story.motion.free",
    thrown: false,
    trayW: 6,
    trayH: 3.6,
    traySurface: "story.motion.tray",
    trayPaint: "panelBg",
    trayOpacity: 0.35,
    trayRadius: 0.12,
    trayStrokeColor: "panelBorder",
    trayStrokeWidth: 0.03,
    trayX: 0,
    trayY: 0,
    puckW: 0.9,
    puckH: 0.9,
    puckSurface: "story.motion.token",
    puckPaint: "textMuted",
    puckRadius: 0.5,
    puckX: -2,
    puckY: 0,
    speed: 8,
    angle: 20,
    spin: 720,
    friction: DEFAULT_TUNING.friction,
    spinFriction: DEFAULT_TUNING.spinFriction,
    bounce: DEFAULT_TUNING.bounce,
  },
  argTypes: {
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    trayW: documented("arg.w", SIZE, "tray/bounds"),
    trayH: documented("arg.h", SIZE, "tray/bounds"),
    traySurface: documented("arg.registerAs", TOKEN, "tray/surface"),
    trayPaint: documented("arg.fill", PAINT, "tray/surface"),
    trayOpacity: documented("arg.fillOpacity", { control: { type: "range", min: 0, max: 1, step: 0.05 } }, "tray/surface"),
    trayRadius: documented("arg.radius", RADIUS, "tray/surface"),
    trayStrokeColor: documented("arg.strokeColor", PAINT, "tray/surface.stroke"),
    trayStrokeWidth: documented("arg.strokeWidth", { control: { type: "number", min: 0, step: 0.01 } }, "tray/surface.stroke"),
    trayX: documented("arg.x", PLACE, "tray/transformable"),
    trayY: documented("arg.y", PLACE, "tray/transformable"),
    puckW: documented("arg.w", SIZE, "puck/bounds"),
    puckH: documented("arg.h", SIZE, "puck/bounds"),
    puckSurface: documented("arg.registerAs", TOKEN, "puck/surface"),
    puckPaint: documented("arg.fill", PAINT, "puck/surface"),
    puckRadius: documented("arg.radius", RADIUS, "puck/surface"),
    puckX: documented("arg.x", PLACE, "puck/transformable"),
    puckY: documented("arg.y", PLACE, "puck/transformable"),
    thrown: documented("arg.thrown", { control: "boolean" }, "puck/motion"),
    speed,
    angle,
    spin,
    friction,
    spinFriction,
    bounce,
  },
  parameters: { gkDocStory: "motion.slide" },
  render: ({
    deskLayout,
    thrown,
    trayW,
    trayH,
    traySurface,
    trayPaint,
    trayOpacity,
    trayRadius,
    trayStrokeColor,
    trayStrokeWidth,
    trayX,
    trayY,
    puckW,
    puckH,
    puckSurface,
    puckPaint,
    puckRadius,
    puckX,
    puckY,
    speed: throwSpeed,
    angle: throwAngle,
    spin: throwSpin,
    friction: drag,
    spinFriction: spinDrag,
    bounce: rebound,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(traySurface, {
      layers: [{ paint: trayPaint, opacity: trayOpacity }],
      radius: trayRadius,
      stroke: { color: trayStrokeColor, width: trayStrokeWidth },
    });
    registerSurface(puckSurface, { layers: [{ paint: puckPaint }], radius: puckRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    add(desk, node("tray", Bounded({ bounds: rect(trayW, trayH) }), Surfaced({ surface: traySurface }), Transformable({ at: { x: trayX, y: trayY } })));
    add(desk, node("puck", Bounded({ bounds: rect(puckW, puckH) }), Surfaced({ surface: puckSurface }), Transformable({ at: { x: puckX, y: puckY } })));
    const s = scene(desk, { animate: true, motion: { friction: drag, spinFriction: spinDrag, bounce: rebound } });
    if (moved(s, "thrown", thrown)) {
      // The tray's inner box, in root units: the puck stays inside by half its own width.
      const walls = {
        x0: trayX - trayW / 2 + puckW / 2,
        y0: trayY - trayH / 2 + puckH / 2,
        x1: trayX + trayW / 2 - puckW / 2,
        y1: trayY + trayH / 2 - puckH / 2,
      };
      s.motions?.slide("puck", { speed: throwSpeed, angle: throwAngle, spin: throwSpin, walls });
    }
    return s.el;
  },
};

// ---- shuffle ----------------------------------------------------------------------------------

/** What a tap on the shuffle scene does RIGHT NOW — the newest render's shuffle. */
let SHUFFLE_TAP: (() => void) | undefined;

interface ShuffleArgs {
  shuffled: number;
  recipe: string;
  seed: number;
  deskLayout: string;
  handLayout: string;
  handGap: number;
  handX: number;
  handY: number;
  cards: RunCard[];
  cardW: number;
  cardH: number;
  cardSurface: string;
  cardRadius: number;
  shuffleMs: number;
}

/**
 * A ROW REORDERED ON THE CLOCK. TAP ANY CARD to shuffle again — `shuffled` on the panel does the
 * same;
 * `seed` decides the ORDER — the truth, `reorder(hand, permutation(n, seededRng(seed)))`, the same
 * on every client that shares the seed — and `recipe` decides the LOOK, and never sees the seed.
 */
export const Shuffle: StoryObj<ShuffleArgs> = {
  args: {
    shuffled: 0,
    recipe: "riffle",
    seed: 7,
    deskLayout: "story.motion.free",
    handLayout: "story.motion.row",
    handGap: 0.25,
    handX: 0,
    handY: 0,
    cards: [
      { paint: "accent" },
      { paint: "alert" },
      { paint: "textMuted" },
      { paint: "panelBg" },
      { paint: "sunkBg" },
      { paint: "accent" },
    ],
    cardW: 0.9,
    cardH: 1.3,
    cardSurface: "story.motion.shuffle",
    cardRadius: 0.08,
    shuffleMs: DEFAULT_TUNING.shuffleMs,
  },
  argTypes: {
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    handLayout: documented("arg.layoutName", TOKEN, "hand/container"),
    handGap: documented("arg.gap", { control: { type: "number", min: 0, step: 0.02 } }, "hand/container"),
    handX: documented("arg.x", PLACE, "hand/transformable"),
    handY: documented("arg.y", PLACE, "hand/transformable"),
    cards: documented("arg.cards", { control: "object" }, "hand/children"),
    cardW: documented("arg.w", SIZE, "hand/children.bounds"),
    cardH: documented("arg.h", SIZE, "hand/children.bounds"),
    cardSurface: documented("arg.registerAs", TOKEN, "hand/children.surface"),
    cardRadius: documented("arg.radius", RADIUS, "hand/children.surface"),
    shuffled: documented("arg.shuffled", { control: { type: "number", min: 0, step: 1 } }, "hand/shuffle"),
    recipe: documented("arg.recipe", { control: "select", options: shuffleNames() }, "hand/shuffle"),
    seed: documented("arg.seed", { control: { type: "number", step: 1 } }, "hand/shuffle"),
    shuffleMs,
  },
  parameters: { gkDocStory: "motion.shuffle" },
  render: ({
    shuffled,
    recipe,
    seed,
    deskLayout,
    handLayout,
    handGap,
    handX,
    handY,
    cards,
    cardW,
    cardH,
    cardSurface,
    cardRadius,
    shuffleMs: ms,
  }) => {
    registerLayout(deskLayout, freeLayout);
    registerLayout(handLayout, rowLayout({ gap: handGap }));
    const desk = node("desk", Container({ layout: deskLayout }));
    // The row keeps whatever order the LAST shuffle left it in: the tree fed on a re-render is the
    // standing one's order, so a slider move does not un-shuffle it.
    const el = LIVE_EL.get("shuffle");
    const standingOrder = el ? (LAST.get(el)?.["order"] as readonly number[] | undefined) : undefined;
    const hand = node("hand", Container({ layout: handLayout }), Transformable({ at: { x: handX, y: handY } }));
    add(desk, hand);
    cards.forEach(({ paint }, i) => {
      registerSurface(`${cardSurface}#${i}`, { layers: [{ paint }], radius: cardRadius });
      add(hand, node(`c${i}`, Bounded({ bounds: rect(cardW, cardH) }), Surfaced({ surface: `${cardSurface}#${i}` })));
    });
    if (standingOrder && standingOrder.length === cards.length) reorder(hand, standingOrder);
    // The tap is wired ONCE, with the scene, and calls what the newest render left in `SHUFFLE_TAP`.
    const s = scene(desk, {
      animate: true,
      motion: { shuffleMs: ms },
      tap: (hit) => {
        if (hit) SHUFFLE_TAP?.();
      },
    });
    LIVE_EL.set("shuffle", s.el);
    /** Shuffle the hand again, from wherever it stands, to what the next draw gives. */
    const fire = (): void => {
      const live = byId(s.host.root, "hand");
      if (!live) return;
      const taps = (LAST.get(s.el)?.["taps"] as number | undefined) ?? 0;
      const order = permutation(live.children.length, seededRng(seed + shuffled + taps));
      // Remember the order the row will stand in, composed over what it stood in before.
      const before = (LAST.get(s.el)?.["order"] as readonly number[] | undefined) ?? cards.map((_, i) => i);
      LAST.set(s.el, { ...LAST.get(s.el), order: order.map((i) => before[i]!) });
      s.motions?.shuffle("hand", () => reorder(live, order), { recipe });
    };
    SHUFFLE_TAP = () => {
      LAST.set(s.el, { ...LAST.get(s.el), taps: ((LAST.get(s.el)?.["taps"] as number | undefined) ?? 0) + 1 });
      fire();
    };
    if (moved(s, "shuffled", shuffled)) fire();
    return s.el;
  },
};

// ---- roll -------------------------------------------------------------------------------------

interface RollArgs {
  rolled: number;
  turns: number;
  hop: number;
  deskLayout: string;
  tokenW: number;
  tokenH: number;
  tokenSurface: string;
  tokenPaint: string;
  tokenRadius: number;
  tokenX: number;
  tokenY: number;
  rollMs: number;
}

/**
 * A TUMBLE IN PLACE — the look of a die rolled without being thrown: `turns` whole turns about its
 * centre and a `hop` (a scale peak) over `rollMs`, with the commit (a die's new face) late in the
 * tumble. Bump `rolled` to tumble again. What it commits is the game's business; here, nothing.
 */
export const Roll: StoryObj<RollArgs> = {
  args: {
    rolled: 0,
    turns: 2,
    hop: 1.25,
    deskLayout: "story.motion.free",
    tokenW: 1,
    tokenH: 1,
    tokenSurface: "story.motion.token",
    tokenPaint: "textMuted",
    tokenRadius: 0.5,
    tokenX: 0,
    tokenY: 0,
    rollMs: DEFAULT_TUNING.rollMs,
  },
  argTypes: {
    deskLayout: documented("arg.layoutName", TOKEN, "desk/container"),
    tokenW: documented("arg.w", SIZE, "token/bounds"),
    tokenH: documented("arg.h", SIZE, "token/bounds"),
    tokenSurface: documented("arg.registerAs", TOKEN, "token/surface"),
    tokenPaint: documented("arg.fill", PAINT, "token/surface"),
    tokenRadius: documented("arg.radius", RADIUS, "token/surface"),
    tokenX: documented("arg.x", PLACE, "token/transformable"),
    tokenY: documented("arg.y", PLACE, "token/transformable"),
    rolled: documented("arg.rolled", { control: { type: "number", min: 0, step: 1 } }, "token/motion"),
    turns: documented("arg.roll.turns", { control: { type: "range", min: 0, max: 6, step: 0.5 } }, "roll"),
    hop: documented("arg.roll.hop", { control: { type: "range", min: 1, max: 2, step: 0.05 } }, "roll"),
    rollMs,
  },
  parameters: { gkDocStory: "motion.roll" },
  render: ({ rolled, turns, hop, deskLayout, tokenW, tokenH, tokenSurface, tokenPaint, tokenRadius, tokenX, tokenY, rollMs: ms }) => {
    registerLayout(deskLayout, freeLayout);
    registerSurface(tokenSurface, { layers: [{ paint: tokenPaint }], radius: tokenRadius });
    const desk = node("desk", Container({ layout: deskLayout }));
    add(desk, piece("token", tokenX, tokenY, tokenW, tokenH, tokenSurface));
    const s = scene(desk, { animate: true, motion: { rollMs: ms } });
    if (moved(s, "rolled", rolled)) s.motions?.roll("token", () => undefined, { turns, hop });
    return s.el;
  },
};
