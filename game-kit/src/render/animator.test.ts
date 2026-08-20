// @vitest-environment jsdom

// The motion runtime, on a fake clock. jsdom has no `requestAnimationFrame` worth trusting, so the
// clock is injected: `tick(t)` sets the time and runs the one scheduled frame. That is also what
// lets a plain test assert a card is HALFWAY — the thing a screenshot can only catch by luck.

import { describe, expect, it } from "vitest";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout, rowLayout } from "../core/atoms/layouts.js";
import { ShadowCaster } from "../core/atoms/shadow.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { add, compose, node, reorder } from "../core/node.js";
import { Flippable, facing, setFacing } from "../core/atoms/flippable.js";
import { DEFAULT_TUNING, installStockEasings, resetEasings } from "../core/motion.js";
import { rect } from "../presets/shapes.js";
import { mount } from "./host.js";
import { registerSurface, resetSurfaces } from "./surfaces.js";
import { installStockFlips, resetFlips } from "./flips.js";
import { installStockShuffles, resetShuffles } from "./shuffles.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { attachMotion, type Clock } from "./animator.js";
import { type Painter } from "./painter.js";
import { type Quad } from "./scenePlan.js";

/** A fake clock whose single pending frame the test runs by hand. */
function fakeClock() {
  let now = 0;
  let pending: (() => void) | null = null;
  const clock: Clock = {
    now: () => now,
    frame: (cb) => {
      pending = cb;
      return () => {
        pending = null;
      };
    },
  };
  return {
    clock,
    idle: () => pending === null,
    tick(at: number) {
      now = at;
      const cb = pending;
      pending = null;
      cb?.();
    },
  };
}

/** A desk with one card at the origin, and a painter that keeps the last plan for inspection. */
function bench() {
  resetLayouts();
  registerLayout("free", freeLayout);
  resetSurfaces();
  installStockSurfaces();
  resetEasings();
  installStockEasings();

  const desk = node("desk", Container({ layout: "free" }));
  const card = node("c", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 0, y: 0 } }));
  add(desk, card);

  let last: readonly Quad[] = [];
  const painter: Painter = {
    ready: Promise.resolve(),
    draw: (plan) => {
      last = plan;
    },
    resize: () => {},
    destroy: () => {},
  };
  const host = mount(document.createElement("div"), desk);
  const xOf = (id: string): number => last.find((q) => q.id === id)!.x;
  const tOf = (id: string) => last.find((q) => q.id === id)!.transform;
  const order = (): string[] => last.map((q) => q.id);
  return { desk, card, host, painter, xOf, tOf, order };
}

describe("the motion runtime", () => {
  it("motion.settles-to-the-new-pose — a moved node eases across and the loop stops when it lands", () => {
    const b = bench();
    const c = fakeClock();
    attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });

    const restX = b.xOf("c");
    // Move the card and publish the new tree: the settle begins, still drawn at the start.
    compose(b.card, Transformable({ at: { x: 4, y: 0 } }));
    b.host.setRoot(b.desk);
    expect(b.xOf("c")).toBeCloseTo(restX); // frame zero: at `from`, not teleported to `to`

    c.tick(50); // halfway
    const midX = b.xOf("c");
    expect(midX).toBeGreaterThan(restX);

    c.tick(100); // arrived
    const endX = b.xOf("c");
    expect(endX).toBeGreaterThan(midX);
    expect(c.idle()).toBe(true); // idle-gate: no frame is scheduled once nothing is in flight
  });

  it("motion.a-flying-node-rides-above — the settle paints over taller rest, and landing hands the order back", () => {
    // A card easing home must not slide UNDER a pile it crosses just because the pile stands
    // taller: while a node is in flight — settling, carried, or mid-flip — the runtime asks the
    // plan to paint it LAST. The quad's own `z` is untouched, so when the flight lands, the
    // resting order is simply what it always was.
    const b = bench();
    const wall = node("wall", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 2, y: 0 }, z: 5 }));
    add(b.desk, wall);
    const c = fakeClock();
    attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });
    expect(b.order()).toEqual(["c", "wall"]); // at rest, height orders the paint

    compose(b.card, Transformable({ at: { x: 4, y: 0 } }));
    b.host.setRoot(b.desk);
    expect(b.order()).toEqual(["wall", "c"]); // in flight from the first frame: the mover on top
    c.tick(50);
    expect(b.order()).toEqual(["wall", "c"]);
    c.tick(100); // landed — the flight is over, and so is the lift
    expect(b.order()).toEqual(["c", "wall"]);
    expect(c.idle()).toBe(true);
  });

  it("motion.a-held-node-tracks-its-gesture — a finger-owned node jumps, it does not ease", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });

    m.hold("c");
    compose(b.card, Transformable({ at: { x: 5, y: 0 } }));
    b.host.setRoot(b.desk);
    const heldX = b.xOf("c");
    // A gesture is 1:1: the node is already at its new tree pose, and no loop was started for it.
    compose(b.card, Transformable({ at: { x: 0, y: 0 } }));
    b.host.setRoot(b.desk);
    expect(b.xOf("c")).not.toBeCloseTo(heldX); // tracked the second move too, still no easing
    expect(c.idle()).toBe(true);

    // Released, the next move eases again — a frame is scheduled.
    m.release("c");
    compose(b.card, Transformable({ at: { x: 6, y: 0 } }));
    b.host.setRoot(b.desk);
    expect(c.idle()).toBe(false);
  });

  it("motion.grab-places-the-run-under-the-finger — drawn at once, a bare grab schedules no frame", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });

    const restX = b.xOf("c");
    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], { anchor: { x: 4, y: 0 }, lift: 1 });
    expect(b.xOf("c") - restX).toBeCloseTo(4); // placed at the finger, the full delta, at once — not eased
    expect(c.idle()).toBe(true); // seeded at the anchor, no pop asked for and no speed — nothing to animate
  });

  it("motion.a-carried-run-strains-at-the-tray-wall — it stops at the border, and a finger that goes on past the leash loses it", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { clock: c.clock, wallSpeed: 3, leash: 1.2 });
    const restX = b.xOf("c");
    let snapped: { ids: readonly string[]; at: { x: number; y: number } } | undefined;
    let knocked = 0;
    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], {
      anchor: { x: 0, y: 0 },
      walls: { x0: -2, y0: -2, x1: 2, y1: 2 },
      onWall: () => knocked++,
      onSnap: (ids, at) => { snapped = { ids, at }; },
    });
    // A SLOW push: an eightieth of a unit a frame is well under `wallSpeed`, so the wall never wins
    // — the run just stops on it and goes on straining after a finger it cannot reach.
    let x = 0;
    let t = 0;
    const creep = (to: number): void => {
      for (; x < to && !snapped; x += 0.0125) {
        m.dragTo({ x, y: 0 });
        c.tick((t += 16));
      }
    };
    creep(2.6);
    expect(knocked).toBe(0);
    expect(snapped).toBeUndefined();
    expect(b.xOf("c") - restX).toBeCloseTo(2, 3); // at the wall, not at the finger's 2.6
    expect(m.velocity()).toBeDefined(); // and still in hand
    // Past the leash, and the hold is not a hold any more: the run is left standing on the wall.
    creep(3.3);
    expect(snapped?.ids).toEqual(["c"]);
    expect(snapped?.at.x).toBeCloseTo(2, 5);
    expect(knocked).toBe(0);
    expect(m.velocity()).toBeUndefined();
    // Left standing on the wall — not teleported back to its seat behind the game's back. From
    // here it is an ordinary settle, and a game that wants it to STAY writes the seat in `onSnap`.
    expect(b.xOf("c") - restX).toBeCloseTo(2, 3);
  });

  it("motion.a-hard-shove-knocks-the-run-off-the-wall — the wall wins and hands the bounce back", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { clock: c.clock, wallSpeed: 3, wallBounce: 0.6 });
    const restX = b.xOf("c");
    let hit: { ids: readonly string[]; speed: number; velocity: { x: number; y: number }; at: { x: number; y: number } } | undefined;
    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], {
      anchor: { x: 0, y: 0 },
      walls: { x0: -2, y0: -2, x1: 2, y1: 2 },
      onWall: (h) => { hit = h; },
      onSnap: () => { throw new Error("a shove is not a snap"); },
    });
    m.dragTo({ x: 9, y: 0 }); // a shove, not a creep
    c.tick(16);
    expect(hit?.ids).toEqual(["c"]);
    expect(hit!.speed).toBeGreaterThanOrEqual(3);
    expect(hit!.at.x).toBeCloseTo(2, 5);
    // It comes back the way it came, with `wallBounce` of the speed it arrived at.
    expect(hit!.velocity.x).toBeLessThan(0);
    expect(Math.abs(hit!.velocity.x)).toBeCloseTo(hit!.speed * 0.6, 5);
    // The gesture is over: the run is off the finger, standing on the wall it hit.
    expect(m.velocity()).toBeUndefined();
    expect(b.xOf("c") - restX).toBeCloseTo(2, 3);
  });

  it("motion.grab-then-drag-rides-the-finger — the run is UNDER the pointer every frame, no trail", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });

    const restX = b.xOf("c");
    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 } });
    // Walk the finger across in steps, as a real pointer stream does, and read the run on EVERY
    // frame. A held thing does not trail the hand: any gap here is felt as sluggishness, so the
    // reading is exact, not "close enough" — the liveliness is the lean and the lift, not lag.
    for (let k = 1; k <= 8; k++) {
      m.dragTo({ x: k, y: 0 });
      c.tick(16 * k);
      expect(b.xOf("c") - restX).toBeCloseTo(k, 6);
    }
    // The chase spring is still running beside the pose — it is the finger's speed, not the pose —
    // so the lean has something to unwind from; once it has, the loop sleeps and the run has not moved.
    for (let t = 144; t <= 3000; t += 16) c.tick(t);
    expect(b.xOf("c") - restX).toBeCloseTo(8, 6);
    expect(c.idle()).toBe(true);
  });

  it("motion.grab-leans-into-horizontal-motion — a tilt appears while moving and unwinds at rest", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });

    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 }, leanFactor: 4, leanMaxDeg: 17 });
    m.dragTo({ x: 10, y: 0 });
    c.tick(16);
    c.tick(32);
    // While the spring has horizontal speed the pose carries a rotation (b ≠ 0) — the whip lean.
    expect(Math.abs(b.tOf("c").b)).toBeGreaterThan(0.02);
    // Once it stops moving, the lean unwinds to upright.
    for (let t = 48; t <= 3000; t += 16) c.tick(t);
    expect(Math.abs(b.tOf("c").b)).toBeCloseTo(0, 2);
  });

  it("motion.a-reversed-drag-swings-the-lean-across — the bank has weight of its own, it does not snap", () => {
    // THE LAW: a hand that turns round does not flip the card over with it. The lean SATURATES, so
    // an ordinary drag holds it pinned at the limit; drawn straight from the speed it would trade
    // `+leanMaxDeg` for `-leanMaxDeg` in four frames — 34 degrees in 67 ms, which reads as a snap.
    // The bank is a spring of its own, so the swing takes the spring's own time and no single frame
    // moves it far. Measured on the DRAWN pose, because that is the only thing an eye can judge.
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });
    const deg = (): number => {
      const t = b.tOf("c");
      return (Math.atan2(t.b, t.a) * 180) / Math.PI;
    };

    const step = 8 * 0.016; // root units per frame — an ordinary phone drag, 8 card-widths a second
    let at = 0;
    let ms = 0;
    const seen: number[] = [];
    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 } });
    for (let f = 0; f < 90; f++) {
      at += f < 45 ? step : -step; // the finger turns round halfway
      m.dragTo({ x: at, y: 0 });
      ms += 16;
      c.tick(ms);
      seen.push(deg());
    }

    const pin = DEFAULT_TUNING.leanMaxDeg;
    const banked = Math.max(...seen.slice(0, 45).map(Math.abs));
    expect(banked).toBeGreaterThan(0.9 * pin); // it still banks: the law is not "kill the lean"
    let worst = 0;
    for (let i = 1; i < seen.length; i++) worst = Math.max(worst, Math.abs(seen[i]! - seen[i - 1]!));
    expect(worst).toBeLessThan(5); // per frame, degrees — the raw lean jumps three times that
    const crossing = seen.slice(45).filter((d) => Math.abs(d) < pin - 0.5).length;
    expect(crossing).toBeGreaterThanOrEqual(8); // frames spent between the two pins: a swing, not a click
  });

  it("motion.a-shadow-rides-the-hand-and-waits-out-a-flight — height is the hand, not the clock", () => {
    // The runtime's half of the shadow law (`plan.a-shadow-follows-the-hand-not-the-flight`): the
    // clock is the only thing that knows WHICH override is a finger's and which is a flight's, and
    // it must hand the plan the finger's set apart from `raised`. Held, the shadow travels with the
    // card; flying home, it waits at the rest the card is coming back to instead of running under it.
    resetLayouts();
    registerLayout("free", freeLayout);
    resetSurfaces();
    installStockSurfaces();
    resetEasings();
    installStockEasings();
    const desk = node("desk", Container({ layout: "free" }));
    const card = node(
      "c",
      Bounded({ bounds: rect(1, 1) }),
      Surfaced(),
      ShadowCaster({ from: "footprint" }),
      Transformable({ at: { x: 0, y: 0 } }),
    );
    add(desk, card);
    let last: readonly Quad[] = [];
    const painter: Painter = { ready: Promise.resolve(), draw: (p) => { last = p; }, resize: () => {}, destroy: () => {} };
    const host = mount(document.createElement("div"), desk);
    const c = fakeClock();
    const m = attachMotion(host, painter, { settleMs: 200, settleEase: "linear", clock: c.clock });
    const at = (id: string): number => last.find((q) => q.id === id)!.x;

    const restCard = at("c");
    const restShade = at("c::shadow");
    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 }, lift: 1 });
    const heldShade = at("c::shadow"); // in hand and unmoved: the fall has already lengthened
    expect(heldShade).not.toBeCloseTo(restShade, 6);
    m.dragTo({ x: 4, y: 0 });
    c.tick(16);
    expect(at("c") - restCard).toBeCloseTo(4, 6);
    expect(at("c::shadow") - heldShade).toBeCloseTo(4, 6); // held: the shadow travels along

    // Let go over the SAME tree: the card flies home, and its shadow is at the seat from frame one.
    m.release("c");
    host.setRoot(desk);
    c.tick(116); // halfway through the settle
    expect(at("c") - restCard).toBeGreaterThan(1); // still well out over the desk
    expect(at("c::shadow")).toBeCloseTo(restShade, 6); // waiting where the card will land
  });

  it("motion.a-carried-node-settles-from-the-finger — and the tree was never written", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });

    const restX = b.xOf("c");
    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 } });
    m.dragTo({ x: 6, y: 0 }); // finger far to the right
    for (let t = 16; t <= 2000; t += 16) c.tick(t); // let the run reach the finger
    const fingerX = b.xOf("c");
    expect(fingerX).toBeGreaterThan(restX);

    // Release and reconcile the SAME, unmoved tree: it eases home FROM where the finger left it, not
    // teleporting, and lands back at its original rest — proof the carry only ever wrote an override.
    m.release("c");
    b.host.setRoot(b.desk);
    expect(b.xOf("c")).toBeCloseTo(fingerX, 1); // frame zero of the settle is at the finger
    expect(c.idle()).toBe(false); // now it eases
    c.tick(2100);
    expect(b.xOf("c")).toBeCloseTo(restX); // home at the tree's rest — the tree never moved
  });

  it("motion.a-new-node-appears-without-flying — a fresh node rests where it is put", () => {
    const b = bench();
    const c = fakeClock();
    attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });

    add(b.desk, node("d", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 3, y: 0 } })));
    b.host.setRoot(b.desk);
    // It did not fly in from nowhere: no frame scheduled, and it is already at its own rest pose.
    expect(c.idle()).toBe(true);
    const restX = b.xOf("c");
    expect(b.xOf("d")).toBeGreaterThan(restX);
  });
});

describe("a flip on the clock", () => {
  /** A face-down card with a back, and a painter that keeps the last plan; `aOf` reads its width scale. */
  function flipBench() {
    resetLayouts();
    registerLayout("free", freeLayout);
    resetSurfaces();
    installStockSurfaces();
    registerSurface("flip.face", { layers: [{ paint: "panelBg" }] });
    registerSurface("flip.back", { layers: [{ paint: "sunkBg" }] });
    resetEasings();
    installStockEasings();
    resetFlips();
    installStockFlips();

    const desk = node("desk", Container({ layout: "free" }));
    const card = node(
      "c",
      Bounded({ bounds: rect(1, 1) }),
      Surfaced({ surface: "flip.face" }),
      Flippable({ flip: "turnOver", turns: 1, back: "flip.back" }), // face-down: odd turns
      Transformable({ at: { x: 0, y: 0 } }),
    );
    add(desk, card);

    let last: readonly Quad[] = [];
    const painter: Painter = { ready: Promise.resolve(), draw: (plan) => { last = plan; }, resize: () => {}, destroy: () => {} };
    const host = mount(document.createElement("div"), desk);
    const aOf = (id: string): number => last.find((q) => q.id === id)!.transform.a;
    return { desk, card, host, painter, aOf };
  }

  it("motion.flip-squeezes-to-an-edge — full width, edge at the midpoint, full again", () => {
    const b = flipBench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { flipMs: 100, clock: c.clock });

    m.flip("c", () => setFacing(b.card, "up"));
    c.tick(0);
    expect(Math.abs(b.aOf("c"))).toBeCloseTo(1); // face-on
    c.tick(50);
    expect(Math.abs(b.aOf("c"))).toBeCloseTo(0, 5); // edge-on halfway — the swap hides here
    c.tick(100);
    expect(Math.abs(b.aOf("c"))).toBeCloseTo(1); // face-on again, the far side
    expect(c.idle()).toBe(true); // idle-gate: nothing scheduled once the turn lands
  });

  it("motion.flip-commits-at-the-edge — the side swaps once, at the midpoint, not before", () => {
    const b = flipBench();
    const c = fakeClock();
    let commits = 0;
    const m = attachMotion(b.host, b.painter, { flipMs: 100, clock: c.clock });

    expect(facing(b.card)).toBe("down");
    m.flip("c", () => { commits++; setFacing(b.card, "up"); });

    c.tick(0);
    expect(commits).toBe(0); // still the old side while the card is wide
    expect(facing(b.card)).toBe("down");
    c.tick(50);
    expect(commits).toBe(1); // swapped at the edge
    expect(facing(b.card)).toBe("up");
    c.tick(100);
    expect(commits).toBe(1); // exactly once
  });

  it("motion.flip-rests-on-the-new-side — the turn ends and starts no second flight", () => {
    const b = flipBench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { flipMs: 100, clock: c.clock });

    m.flip("c", () => setFacing(b.card, "up"));
    c.tick(0);
    c.tick(50);
    c.tick(100);
    // Landed face-up at full width, and the rest-pose flip did not race a second settle.
    expect(facing(b.card)).toBe("up");
    expect(Math.abs(b.aOf("c"))).toBeCloseTo(1);
    expect(c.idle()).toBe(true);
  });
});

describe("the tuning and the viewer's speed", () => {
  it("motion.tuning-defaults-apply — a bare runtime moves by DEFAULT_TUNING, a bare grab pops by it", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { clock: c.clock });
    // The settle: at half the default duration it is between, at the whole it has landed.
    compose(b.card, Transformable({ at: { x: 4, y: 0 } }));
    b.host.setRoot(b.desk);
    const restX = b.xOf("c");
    c.tick(DEFAULT_TUNING.settleMs / 2);
    expect(b.xOf("c")).toBeGreaterThan(restX);
    c.tick(DEFAULT_TUNING.settleMs);
    expect(c.idle()).toBe(true);
    // The carry: no options at all, and the run pops to the default lift — so a frame IS scheduled.
    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 } });
    expect(c.idle()).toBe(false);
    for (let t = DEFAULT_TUNING.settleMs + 16; t <= 3000; t += 16) c.tick(t);
    expect(b.tOf("c").a).toBeCloseTo(DEFAULT_TUNING.lift, 2);
  });

  it("motion.settle-obeys-viewer-speed — twice the speed lands in half the time; zero lands next frame", () => {
    const b = bench();
    const c = fakeClock();
    attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });
    b.host.setViewer({ ...b.host.viewer(), motionSpeed: 2 });
    compose(b.card, Transformable({ at: { x: 4, y: 0 } }));
    b.host.setRoot(b.desk);
    const restX = b.xOf("c");
    c.tick(25); // a quarter of the designed time — but half of the warped one
    const quarter = b.xOf("c") - restX;
    c.tick(50); // half the designed time: at speed 2 it has arrived
    expect(b.xOf("c") - restX).toBeGreaterThan(quarter);
    expect(c.idle()).toBe(true);
    // Speed 0: no animation. The move is on the glass one frame later, whole.
    b.host.setViewer({ ...b.host.viewer(), motionSpeed: 0 });
    compose(b.card, Transformable({ at: { x: -4, y: 0 } }));
    b.host.setRoot(b.desk);
    c.tick(51);
    expect(c.idle()).toBe(true);
    const nowX = b.xOf("c");
    b.host.setRoot(b.desk); // nothing else moves: it is where it rests
    expect(b.xOf("c")).toBeCloseTo(nowX);
  });

  it("motion.speed-changes-mid-flight-are-smooth — progress is kept, only the pace changes", () => {
    const b = bench();
    const c = fakeClock();
    attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });
    compose(b.card, Transformable({ at: { x: 4, y: 0 } }));
    b.host.setRoot(b.desk);
    const restX = b.xOf("c");
    c.tick(50); // halfway at speed 1
    const half = b.xOf("c") - restX;
    b.host.setViewer({ ...b.host.viewer(), motionSpeed: 0.5 }); // slow down mid-flight
    c.tick(66);
    const after = b.xOf("c") - restX;
    // No jump either way: still past halfway, and only a little (16 ms at half speed = 8 warped ms).
    expect(after).toBeGreaterThan(half);
    expect(after - half).toBeLessThan(half * 0.25);
    expect(c.idle()).toBe(false);
  });

  it("motion.flip-has-its-own-clock — flipMs, not settleMs, times a turn", () => {
    const b = bench();
    const c = fakeClock();
    let commits = 0;
    const m = attachMotion(b.host, b.painter, { settleMs: 1000, flipMs: 100, clock: c.clock });
    m.flip("c", () => commits++);
    c.tick(50);
    expect(commits).toBe(1); // the edge came at half of flipMs, not half of settleMs
    c.tick(100);
    expect(c.idle()).toBe(true);
  });
});

describe("choreographies: shuffle and roll", () => {
  function group() {
    resetLayouts();
    registerLayout("free", freeLayout);
    resetSurfaces();
    installStockSurfaces();
    resetEasings();
    installStockEasings();
    resetShuffles();
    installStockShuffles();
    // A ROW seats its children by index — so a reorder actually moves them. (In a free layout the
    // seats are the children's own `at`, and a reorder is invisible.)
    registerLayout("row", rowLayout({ gap: 0.5 }));
    const desk = node("desk", Container({ layout: "free" }));
    const hand = node("hand", Container({ layout: "row" }), Transformable({ at: { x: 0, y: 0 } }));
    add(desk, hand);
    for (let i = 0; i < 4; i++) add(hand, node(`t${i}`, Bounded({ bounds: rect(1, 1) }), Surfaced()));
    let last: readonly Quad[] = [];
    const painter: Painter = { ready: Promise.resolve(), draw: (plan) => { last = plan; }, resize: () => {}, destroy: () => {} };
    const host = mount(document.createElement("div"), desk);
    const xOf = (id: string): number => last.find((q) => q.id === id)!.x;
    const tOf = (id: string) => last.find((q) => q.id === id)!.transform;
    return { desk, hand, host, painter, xOf, tOf };
  }

  it("motion.shuffle-commits-once-at-its-phase — the reorder happens under the recipe, and every child lands on its new seat", () => {
    const g = group();
    const c = fakeClock();
    const m = attachMotion(g.host, g.painter, { shuffleMs: 100, clock: c.clock });
    const seatBefore = { t0: g.xOf("t0"), t3: g.xOf("t3") };
    let commits = 0;
    m.shuffle("hand", () => { commits++; reorder(g.hand, [3, 2, 1, 0]); }, { recipe: "riffle" });
    c.tick(10);
    expect(commits).toBe(0);
    // Off the seats: the halves have parted.
    expect(Math.abs(g.xOf("t0") - seatBefore.t0)).toBeGreaterThan(0.05);
    c.tick(50);
    expect(commits).toBe(1);
    c.tick(75);
    expect(commits).toBe(1);
    c.tick(100);
    expect(c.idle()).toBe(true);
    // Landed on the NEW seats: t3 sits where t0 sat, exactly — no settle needed afterwards.
    expect(g.xOf("t3")).toBeCloseTo(seatBefore.t0, 5);
    expect(g.xOf("t0")).toBeCloseTo(seatBefore.t3, 5);
    g.host.setRoot(g.desk);
    expect(c.idle()).toBe(true); // and a fresh reconcile finds nothing to ease
  });

  it("motion.shuffle-obeys-viewer-speed — at speed 0 the order is on the glass next frame", () => {
    const g = group();
    const c = fakeClock();
    const m = attachMotion(g.host, g.painter, { shuffleMs: 1000, clock: c.clock });
    g.host.setViewer({ ...g.host.viewer(), motionSpeed: 0 });
    const t0 = g.xOf("t0");
    m.shuffle("hand", () => reorder(g.hand, [3, 2, 1, 0]), { recipe: "wash" });
    c.tick(16);
    expect(g.xOf("t3")).toBeCloseTo(t0, 5);
    expect(c.idle()).toBe(true);
  });

  it("motion.roll-turns-and-commits — the piece turns whole turns, hops, and commits late in the tumble", () => {
    const b = bench();
    const c = fakeClock();
    let commits = 0;
    const m = attachMotion(b.host, b.painter, { rollMs: 100, clock: c.clock });
    m.roll("c", () => commits++, { turns: 1, hop: 1.5 });
    c.tick(50);
    // Mid-tumble: turned (b ≠ 0) and grown (the hop peaks at the middle).
    expect(Math.abs(b.tOf("c").b)).toBeGreaterThan(0.01);
    expect(Math.hypot(b.tOf("c").a, b.tOf("c").b)).toBeCloseTo(1.5, 1);
    expect(commits).toBe(0);
    c.tick(75);
    expect(commits).toBe(1);
    c.tick(100);
    expect(commits).toBe(1);
    expect(b.tOf("c").a).toBeCloseTo(1, 5); // whole turns: upright again, at rest size
    expect(Math.abs(b.tOf("c").b)).toBeCloseTo(0, 5);
    expect(c.idle()).toBe(true);
  });

  it("motion.a-tumble-shows-a-face-a-turn-and-slows-with-it — the faces are counted off the turn, so they thin out as it slows", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { rollMs: 900, clock: c.clock });
    const shown: { at: number; last: boolean }[] = [];
    let at = 0;
    m.roll("c", () => undefined, { turns: 2, onTumble: (_n, last) => shown.push({ at, last }) });
    for (at = 8; at <= 900; at += 8) c.tick(at);

    // Two turns at a face every 60° — twelve of them, and the twelfth is the result's own.
    expect(shown.length).toBe(12);
    expect(shown.filter((f) => f.last).length).toBe(1);
    expect(shown[shown.length - 1]!.last).toBe(true);
    // It starts at once: three faces inside the first fifth of the tumble, not one late change.
    expect(shown[2]!.at).toBeLessThan(180);
    const gaps = shown.slice(1).map((f, i) => f.at - shown[i]!.at);
    const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length;
    // And it SLOWS: the last wait is several times the first, and the second half of the tumble is
    // paid out at less than half the rate of the first.
    expect(gaps[gaps.length - 1]!).toBeGreaterThan(gaps[0]! * 3);
    expect(mean(gaps.slice(gaps.length / 2))).toBeGreaterThan(mean(gaps.slice(0, gaps.length / 2)) * 2);
  });

  it("motion.a-tumble-lands-its-result-while-it-still-turns — the commit falls on the last face, and the piece is still moving under it", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { rollMs: 900, clock: c.clock });
    let at = 0;
    let commits = 0;
    let commitAt = -1;
    let lastFaceAt = -1;
    let facesAfterCommit = 0;
    m.roll(
      "c",
      () => {
        commits++;
        commitAt = at;
      },
      {
        turns: 2,
        onTumble: (_n, last) => {
          if (last) lastFaceAt = at;
          if (commits > 0 && !last) facesAfterCommit++;
        },
      },
    );
    const turnOfFrame = (): number => (Math.atan2(b.tOf("c").b, b.tOf("c").a) * 180) / Math.PI;
    let prev = turnOfFrame();
    let turnedAfter = 0; // degrees still walked once the result was on the glass
    let turnedOnTheFrame = 0;
    for (at = 8; at <= 900; at += 8) {
      c.tick(at);
      const now = turnOfFrame();
      const step = Math.abs((((now - prev + 540) % 360) - 180)); // small deltas, wrap-free
      prev = now;
      if (commitAt >= 0 && at === commitAt) turnedOnTheFrame = step;
      else if (commitAt >= 0 && at > commitAt) turnedAfter += step;
    }
    expect(commits).toBe(1);
    // The result is not a phase of its own — it is the tumble's last face, on the same frame.
    expect(commitAt).toBe(lastFaceAt);
    expect(facesAfterCommit).toBe(0);
    // ...and the piece is still turning under it: a picture that changes on a still piece is the
    // swap the eye catches.
    expect(turnedOnTheFrame).toBeGreaterThan(1);
    expect(turnedAfter).toBeGreaterThan(10);
  });
});

describe("flights: launch and slide", () => {
  it("motion.a-slide-tumbles-on-its-own-travel — the faces come off the body's own path, and the result lands before it stops", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { friction: 6, spinFriction: 540, clock: c.clock });
    const shown: { at: number; last: boolean }[] = [];
    let at = 0;
    let restedAt = -1;
    let restX = 0;
    let xAtResult = 0;
    m.slide("c", {
      speed: 6,
      angle: 0,
      spin: 720,
      onTumble: (_n, last) => {
        shown.push({ at, last });
        if (last) xAtResult = b.tOf("c").e;
      },
      onDone: (rest) => {
        restedAt = at;
        restX = rest.at.x;
      },
    });
    for (at = 8; at <= 3000 && restedAt < 0; at += 8) c.tick(at);

    expect(restedAt).toBeGreaterThan(0);
    expect(shown.length).toBeGreaterThan(8);
    expect(shown.filter((f) => f.last).length).toBe(1);
    expect(shown[shown.length - 1]!.last).toBe(true);
    // The result is shown while the die is still sliding — not written onto one that has stopped.
    expect(shown[shown.length - 1]!.at).toBeLessThan(restedAt);
    expect(Math.abs(restX - xAtResult)).toBeGreaterThan(0.1);
    // And the cadence is the body's: friction eats the speed, so the waits grow.
    const gaps = shown.slice(1).map((f, i) => f.at - shown[i]!.at);
    expect(gaps[gaps.length - 1]!).toBeGreaterThan(gaps[0]!);
  });

  it("motion.launch-falls-and-leaves-the-glass — gravity, the floor bounce, then gone with a callback", () => {
    const b = bench();
    const c = fakeClock();
    let done = 0;
    const m = attachMotion(b.host, b.painter, { gravity: 20, bounce: 0.5, clock: c.clock });
    const restX = b.xOf("c");
    const restY = b.tOf("c").f;
    m.launch("c", { speed: 4, angle: 0, onDone: () => done++ }); // straight right, gravity takes it down
    c.tick(16);
    c.tick(32);
    expect(b.xOf("c")).toBeGreaterThan(restX);
    expect(b.tOf("c").f).toBeGreaterThan(restY); // falling: down the screen
    let frames = 0;
    for (let t = 48; t <= 20000 && done === 0; t += 16, frames++) c.tick(t);
    expect(done).toBe(1);
    expect(frames).toBeGreaterThan(5);
    // The override is gone and the tree was never written: in the SAME frame it starts easing HOME
    // from where it left the glass — an honest settle, never a frame at the old seat in between.
    expect(c.idle()).toBe(false);
    for (let t = 20016; t <= 21000; t += 16) c.tick(t);
    expect(b.xOf("c")).toBeCloseTo(restX);
    expect(c.idle()).toBe(true);
  });

  it("motion.launch-waits-its-turn — delayMs holds the body at rest before it goes", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { clock: c.clock });
    const restX = b.xOf("c");
    m.launch("c", { speed: 4, angle: 0, delayMs: 100 });
    c.tick(50);
    expect(b.xOf("c")).toBeCloseTo(restX); // not yet
    c.tick(116);
    c.tick(132);
    expect(b.xOf("c")).toBeGreaterThan(restX);
  });

  it("motion.slide-bleeds-to-a-stop — friction ends it where it lies, and the landing reports the pose", () => {
    const b = bench();
    const c = fakeClock();
    let landed: { at: { x: number; y: number }; angle: number } | undefined;
    const m = attachMotion(b.host, b.painter, { friction: 6, spinFriction: 720, clock: c.clock });
    const restX = b.xOf("c");
    m.slide("c", { speed: 3, angle: 0, spin: 360, onDone: (r) => { landed = r; } });
    for (let t = 16; t <= 3000 && !landed; t += 16) c.tick(t);
    expect(landed).toBeDefined();
    expect(landed!.at.x).toBeGreaterThan(0.5); // v²/2a ≈ 0.75 units to the right of the origin
    expect(landed!.at.x).toBeLessThan(1);
    expect(landed!.angle).toBeGreaterThan(60); // it turned on the way
    // Its override is gone but the glass remembers where it lies: a game that does NOT write the
    // landing gets a settle home from there (from ≠ to) — begun in the landing frame, so it is
    // still lying there now — one that does gets no flight at all (the dice add-on's tests).
    const lyingX = b.xOf("c");
    expect(lyingX).toBeGreaterThan(restX);
    expect(c.idle()).toBe(false);
    for (let t = 3016; t <= 4000; t += 16) c.tick(t);
    expect(b.xOf("c")).toBeCloseTo(restX);
    expect(c.idle()).toBe(true);
  });

  it("motion.slide-obeys-walls-and-speed — a tray keeps it in; speed 0 stops it where it stands", () => {
    const b = bench();
    const c = fakeClock();
    let landed: { at: { x: number; y: number } } | undefined;
    const m = attachMotion(b.host, b.painter, { friction: 1, clock: c.clock });
    m.slide("c", { speed: 5, angle: 0, walls: { x0: -1, y0: -1, x1: 1, y1: 1 }, onDone: (r) => { landed = r; } });
    for (let t = 16; t <= 20000 && !landed; t += 16) {
      c.tick(t);
      expect(b.tOf("c").e / 100).toBeLessThanOrEqual(1.01 + 5); // never far outside (units → px at unit 100 handled loosely)
    }
    expect(landed).toBeDefined();
    expect(Math.abs(landed!.at.x)).toBeLessThanOrEqual(1 + 1e-6);
    // Speed 0: a fresh throw ends on its next frame, at its start.
    b.host.setViewer({ ...b.host.viewer(), motionSpeed: 0 });
    let quick: { at: { x: number; y: number } } | undefined;
    m.slide("c", { speed: 5, angle: 0, onDone: (r) => { quick = r; } });
    c.tick(30000);
    expect(quick).toBeDefined();
    c.tick(30016); // and at speed 0 the settle home from the landing is over on the next frame too
    expect(c.idle()).toBe(true);
  });

  it("motion.velocity-reads-the-carry — a throw on release inherits the finger's speed", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { clock: c.clock });
    expect(m.velocity()).toBeUndefined();
    m.grab([{ id: "c", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 } });
    m.dragTo({ x: 10, y: 0 });
    c.tick(16);
    c.tick(32);
    const v = m.velocity()!;
    expect(v.x).toBeGreaterThan(0); // chasing to the right
    m.slide("c", { speed: v.x, angle: 0 }); // the throw takes over: the carry is over
    expect(m.velocity()).toBeUndefined();
  });

  it("motion.retain-paints-only-the-flying — the frame is the raised set, no shadows, and it asks the painter to keep", () => {
    const b = bench();
    const c = fakeClock();
    let lastRetain: boolean | undefined;
    const painter: Painter = { ready: Promise.resolve(), draw: (plan, _m, _t, o) => { lastPlan = plan; lastRetain = o?.retain; }, resize: () => {}, destroy: () => {} };
    let lastPlan: readonly Quad[] = [];
    add(b.desk, node("wall", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 2, y: 0 } })));
    const m = attachMotion(b.host, painter, { clock: c.clock });
    expect(lastPlan.map((q) => q.id)).toEqual(["c", "wall"]);
    expect(lastRetain).toBe(false);
    m.retain(true);
    expect(lastRetain).toBe(true);
    expect(lastPlan).toEqual([]); // nothing flies: nothing is painted over the kept glass
    m.launch("c", { speed: 4, angle: 0 });
    c.tick(16);
    expect(lastPlan.map((q) => q.id)).toEqual(["c"]); // only the flyer
    m.retain(false);
    expect(lastRetain).toBe(false);
    expect(lastPlan.map((q) => q.id).sort()).toEqual(["c", "wall"]);
  });
});

describe("retuning a running clock", () => {
  it("motion.retune-changes-the-next-flight — the running one keeps its pace, the next reads the new numbers", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", clock: c.clock });
    expect(m.tuning().settleMs).toBe(100);
    compose(b.card, Transformable({ at: { x: 4, y: 0 } }));
    b.host.setRoot(b.desk);
    m.retune({ settleMs: 1000 });
    expect(m.tuning().settleMs).toBe(1000);
    c.tick(100); // the flight in progress was started at 100 ms: it lands now, untouched by the retune
    expect(c.idle()).toBe(true);
    compose(b.card, Transformable({ at: { x: 0, y: 0 } }));
    b.host.setRoot(b.desk);
    c.tick(200); // 100 ms into a 1000 ms flight — not there yet
    expect(c.idle()).toBe(false);
    c.tick(1100);
    expect(c.idle()).toBe(true);
  });
});

describe("a flight goes from where the node is", () => {
  it("motion.a-delayed-launch-goes-from-the-settled-seat — the settle runs on until the flight goes, and the body starts THERE", () => {
    // The victory cascade's bug: a card that had just been moved onto its foundation (a settle asked
    // and not yet drawn) was launched from its OLD seat, because the flight took the pose at the call.
    // A flight filed with a delay lets the settle land and starts from the landed seat.
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { settleMs: 100, settleEase: "linear", gravity: 0, clock: c.clock });
    const oldX = b.xOf("c");
    compose(b.card, Transformable({ at: { x: 4, y: 0 } }));
    b.host.setRoot(b.desk); // the settle is asked; frame zero is still at the old seat
    m.launch("c", { speed: 0.001, angle: 0, delayMs: 150 }); // goes after the settle has landed
    c.tick(50);
    const midX = b.xOf("c");
    expect(midX).toBeGreaterThan(oldX); // the settle kept running: the card is on its way, not frozen
    c.tick(100);
    const seatX = b.xOf("c"); // landed on the new seat
    c.tick(160); // the flight goes now — from the seat, not from the old place
    expect(b.xOf("c")).toBeCloseTo(seatX, 1);
    expect(Math.abs(b.xOf("c") - oldX)).toBeGreaterThan(Math.abs(seatX - oldX) * 0.9);
  });
});

describe("a launch reports its bounces", () => {
  it("motion.launch-reports-its-bounces — onBounce fires at each touch of the floor, first with 1; a chain hangs on it", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { gravity: 30, bounce: 0.6, clock: c.clock });
    const seen: number[] = [];
    let chained = false;
    m.launch("c", { speed: 4, angle: 300, floor: 1, onBounce: (n) => { seen.push(n); if (n === 1) chained = true; } });
    for (let t = 16; t <= 6000 && seen.length < 2; t += 16) c.tick(t);
    expect(seen[0]).toBe(1);
    expect(seen[1]).toBe(2); // the second touch, softer, still reported
    expect(chained).toBe(true);
    // Without a floor nothing ever bounces.
    const b2 = bench();
    const c2 = fakeClock();
    const m2 = attachMotion(b2.host, b2.painter, { gravity: 30, clock: c2.clock });
    let none = 0;
    m2.launch("c", { speed: 4, angle: 0, floor: Infinity, onBounce: () => none++ });
    for (let t = 16; t <= 3000; t += 16) c2.tick(t);
    expect(none).toBe(0);
  });
});

describe("a launch may chain another from its own callback", () => {
  it("motion.a-launch-chains-from-onBounce — the next body goes from inside the callback, on the same clock, with no outside event", () => {
    const b = bench();
    add(b.desk, node("d", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 2, y: 0 } })));
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { gravity: 30, clock: c.clock });
    const dHome = b.xOf("d");
    let chainedAt = -1;
    m.launch("c", { speed: 4, angle: 300, floor: 1, delayMs: 200, onBounce: (n) => { if (n === 1 && chainedAt < 0) { chainedAt = c.clock.now(); m.launch("d", { speed: 4, angle: 0, floor: 1 }); } } });
    let dMoved = false;
    for (let t = 16; t <= 6000 && !c.idle(); t += 16) {
      c.tick(t);
      if (chainedAt >= 0 && Math.abs(b.xOf("d") - dHome) > 0.01) dMoved = true;
    }
    expect(chainedAt).toBeGreaterThan(200); // the first went after its delay and touched down
    expect(dMoved).toBe(true); // the second flew on its own — the loop never needed a nudge
    expect(c.idle()).toBe(true); // and everything came to rest (both left the glass and eased home)
  });
});
