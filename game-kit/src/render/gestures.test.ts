// THE THREE GESTURES BESIDE THE LONG PRESS, and the one law they share: each of them REPORTS and
// none of them decides. What is tested here is therefore never "the deck was dealt" — it is "the
// hand did this, and the numbers handed over say so".
//
// Nothing is faked but the view. Time is a NUMBER on the event, because that is what these three
// measure — none of them waits for silence, which is the whole difference from a long press.

import { beforeEach, describe, expect, it } from "vitest";
import { add, caps, node, type Node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { Draggable } from "../core/atoms/draggable.js";
import { freeLayout, rowLayout } from "../core/atoms/layouts.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { resetSurfaces } from "./surfaces.js";
import { rect } from "../presets/shapes.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { type Host } from "./host.js";
import { wireSwipe, type Swipe } from "./swipe.js";
import { wirePan, type Pan } from "./pan.js";
import { wireShake, type Shaking } from "./shake.js";
import { wireKnead, type Knead } from "./knead.js";

type Fire = (
  type: string,
  x: number,
  y: number,
  opts?: { id?: number; ms?: number; coalesced?: ReadonlyArray<{ x: number; y: number; ms: number }> },
) => void;

/** A view that only records its listeners — these wirings ask it for nothing else worth faking. */
function stubView(): { el: HTMLCanvasElement; fire: Fire; captured: Set<number> } {
  const listeners = new Map<string, Array<(e: PointerEvent) => void>>();
  // A view that remembers which fingers it was asked to hold. Faked because jsdom's own capture is
  // a no-op, and what is being asserted is that the ASKING happens.
  const captured = new Set<number>();
  const el = {
    style: {},
    setPointerCapture: (id: number) => void captured.add(id),
    releasePointerCapture: (id: number) => void captured.delete(id),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (t: string, f: (e: PointerEvent) => void) => void listeners.set(t, [...(listeners.get(t) ?? []), f]),
    removeEventListener: (t: string, f: (e: PointerEvent) => void) =>
      void listeners.set(t, (listeners.get(t) ?? []).filter((g) => g !== f)),
  } as unknown as HTMLCanvasElement;
  return {
    el,
    captured,
    fire: (type, x, y, o = {}) => {
      // `getCoalescedEvents` is the readings the GLASS took between two frames — present only when
      // a test is about them, because a browser without it (and jsdom is one) hands over the event
      // itself, and that fallback has to keep being exercised by every other test here.
      const coalesced = o.coalesced?.map(
        (c) => ({ clientX: c.x, clientY: c.y, pointerId: o.id ?? 1, timeStamp: c.ms }) as unknown as PointerEvent,
      );
      const e = {
        clientX: x,
        clientY: y,
        pointerId: o.id ?? 1,
        timeStamp: o.ms ?? 0,
        ...(coalesced ? { getCoalescedEvents: () => coalesced } : {}),
      } as unknown as PointerEvent;
      for (const f of listeners.get(type) ?? []) f(e);
    },
  };
}

/**
 * TWO PIECES SIDE BY SIDE on an 800×600 view at 100 px/unit: `left` is centred at glass x 350 and
 * `right` at 450, both at y 300. So the desk's origin is glass (400, 300), and a hundred pixels is
 * one unit — every number in this file can be read off that.
 */
function bench() {
  const desk = node("desk", Container({ layout: "row" }));
  for (const id of ["left", "right"]) add(desk, node(id, Bounded({ bounds: rect(0.9, 1.2) }), Surfaced(), Draggable()));
  const view = stubView();
  const host = {
    view: view.el,
    root: desk,
    unit: () => 100,
    viewport: () => ({ width: 800, height: 600, dpr: 1 }),
    viewer: () => DEFAULT_VIEWER,
    setRoot: () => undefined,
  } as unknown as Host;
  return { host, fire: view.fire, captured: view.captured };
}

const grabbable = (n: Node): boolean => caps(n).has("Draggable");

beforeEach(() => {
  resetLayouts();
  registerLayout("free", freeLayout);
  registerLayout("row", rowLayout({ gap: 0.2, padding: 0 }));
  resetSurfaces();
  installStockSurfaces();
});

// A DRAG AND A SWIPE ARE THE SAME PIXELS. Everything below is a way of saying what tells them
// apart: not the path, but what the hand was doing as it let go.
describe("the swipe", () => {
  function swiping(opts: Partial<Parameters<typeof wireSwipe>[0]> = {}) {
    const b = bench();
    const seen: Swipe[] = [];
    const stop = wireSwipe({ host: b.host, want: grabbable, onSwipe: (s) => seen.push(s), ...opts });
    return { ...b, seen, stop };
  }

  it("swipe.a-finger-that-left-is-a-swipe — fast, far and straight, off a node the consumer allows", () => {
    const f = swiping();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 450, 300, { ms: 50 });
    f.fire("pointerup", 500, 300, { ms: 60 });
    expect(f.seen.length).toBe(1);
    const s = f.seen[0]!;
    expect(s.on.id).toBe("left");
    expect(s.angle, "degrees clockwise from +x — a throw's own angle, with nothing translating").toBeCloseTo(0, 5);
    expect(s.reach).toBeCloseTo(1.5, 5);
    expect(s.speed).toBeGreaterThan(3);
    expect(s.straight).toBeCloseTo(1, 5);
  });

  it("swipe.a-slow-finger-is-a-drag — the same path, and no swipe at all", () => {
    const f = swiping();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 450, 300, { ms: 900 });
    f.fire("pointerup", 500, 300, { ms: 1800 });
    expect(f.seen, "the hand put the piece down; it did not send it anywhere").toEqual([]);
  });

  it("swipe.the-parting-speed-is-what-counts-not-the-average — a dawdle and then a flick", () => {
    // THE LAW THE WINDOW EXISTS FOR. Averaged over the whole gesture this finger crawled; what it
    // did at the end is what the hand meant, and it is the only part that is read.
    const f = swiping();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 352, 300, { ms: 500 });
    f.fire("pointermove", 350, 300, { ms: 900 });
    f.fire("pointermove", 500, 300, { ms: 1000 });
    f.fire("pointerup", 500, 300, { ms: 1010 });
    expect(f.seen.length, "1.5 units in the last 110 ms, not 1.54 units in a second").toBe(1);
    expect(f.seen[0]!.speed).toBeGreaterThan(10);
  });

  it("swipe.a-crisp-tap-is-not-a-swipe — a fast finger that went nowhere", () => {
    const f = swiping();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 356, 300, { ms: 4 });
    f.fire("pointerup", 358, 300, { ms: 8 });
    expect(f.seen, "speed alone would have passed; a swipe has to have gone somewhere").toEqual([]);
  });

  it("swipe.a-finger-that-changed-its-mind-is-not-a-swipe — the straightness gate", () => {
    // What keeps a knead off the same pack from being read as a deal: ground covered fast, and
    // nowhere reached.
    const f = swiping();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 550, 300, { ms: 20 });
    f.fire("pointermove", 350, 300, { ms: 40 });
    f.fire("pointermove", 500, 300, { ms: 60 });
    f.fire("pointerup", 500, 300, { ms: 70 });
    expect(f.seen).toEqual([]);
  });

  it("swipe.the-other-finger-is-reported-as-an-anchor — one hand holds, the other deals", () => {
    // The whole reason this file knows about more than one finger. The roles ARE the arbitration,
    // and a consumer cannot write it without being told what the other hand was doing.
    const f = swiping();
    f.fire("pointerdown", 350, 300, { id: 1, ms: 0 });
    f.fire("pointermove", 352, 301, { id: 1, ms: 40 });
    f.fire("pointerdown", 355, 305, { id: 2, ms: 60 });
    f.fire("pointermove", 455, 305, { id: 2, ms: 110 });
    f.fire("pointerup", 505, 305, { id: 2, ms: 120 });
    expect(f.seen.length).toBe(1);
    const a = f.seen[0]!.anchor!;
    expect(a.on?.id, "and it says WHAT the other hand was on").toBe("left");
    expect(a.drift, "and how far it has wandered — a fact, not a verdict").toBeCloseTo(Math.hypot(2, 1), 5);
  });

  it("swipe.an-anchor-that-wandered-says-so — and it is the game's business what that means", () => {
    const f = swiping();
    f.fire("pointerdown", 350, 300, { id: 1, ms: 0 });
    f.fire("pointermove", 380, 340, { id: 1, ms: 40 }); // that hand is dragging, not holding
    f.fire("pointerdown", 355, 305, { id: 2, ms: 60 });
    f.fire("pointermove", 455, 305, { id: 2, ms: 110 });
    f.fire("pointerup", 505, 305, { id: 2, ms: 120 });
    // Reported, and NOT judged here. A hand holding a pack while the other deals off it may be
    // dragging the pack at the same time, and there is no contradiction in that — a threshold
    // shipped from this file was a gate against a conflict that does not exist.
    expect(f.seen[0]!.anchor!.drift, "the whole travel of that hand, in glass pixels").toBeCloseTo(Math.hypot(30, 40), 5);
  });

  it("swipe.only-off-what-the-consumer-allows — and bare desk is never a swipe", () => {
    const f = swiping({ want: (n: Node) => n.id === "right" });
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 450, 300, { ms: 50 });
    f.fire("pointerup", 500, 300, { ms: 60 });
    expect(f.seen, "the left piece is not this consumer's business").toEqual([]);

    f.fire("pointerdown", 100, 80, { ms: 100 });
    f.fire("pointermove", 200, 80, { ms: 150 });
    f.fire("pointerup", 250, 80, { ms: 160 });
    expect(f.seen).toEqual([]);
  });

  it("swipe.the-thresholds-are-the-consumers — a lighter deal is one number, not a fork", () => {
    const f = swiping({ minSpeed: 0.5, minReach: 0.1 });
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 380, 300, { ms: 200 });
    f.fire("pointerup", 380, 300, { ms: 210 });
    expect(f.seen.length).toBe(1);
  });

  it("swipe.a-torn-off-gesture-reports-nothing — pointercancel is not a release", () => {
    const f = swiping();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 450, 300, { ms: 50 });
    f.fire("pointercancel", 500, 300, { ms: 60 });
    expect(f.seen).toEqual([]);
  });
});

// A SHAKE HAS NO MOMENT AT WHICH IT HAPPENS, so it is a reading and not an event. Half of what is
// below is that sentence, tested.
// A PAN IS THE SAME FINGERS, REPORTED WHILE THEY MOVE. `UIPanGestureRecognizer`, down to the state
// names — and the reason it exists beside the swipe is that a verdict delivered on release cannot
// say "the card is already going, this way, this fast", because by then the gesture is over.
describe("the pan", () => {
  function panning(opts: Partial<Parameters<typeof wirePan>[0]> = {}) {
    const b = bench();
    const seen: Pan[] = [];
    const stop = wirePan({ host: b.host, want: grabbable, onPan: (p) => seen.push(p), ...opts });
    return { ...b, seen, stop };
  }

  it("pan.reports-while-the-finger-moves — began at the slop, changed at every step, ended once", () => {
    const f = panning();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 355, 300, { ms: 10 }); // five pixels: inside the slop, still nothing
    expect(f.seen).toEqual([]);
    f.fire("pointermove", 380, 300, { ms: 20 });
    f.fire("pointermove", 430, 300, { ms: 40 });
    f.fire("pointerup", 450, 300, { ms: 50 });
    expect(f.seen.map((p) => p.state)).toEqual(["began", "changed", "ended"]);
    expect(new Set(f.seen.map((p) => p.id)), "one finger, one id, from began to ended").toEqual(new Set([1]));
    const began = f.seen[0]!;
    expect(began.on.id).toBe("left");
    // A card is off the pack HERE — a third of a unit in, while the finger is still moving.
    expect(began.translation.x).toBeCloseTo(0.3, 5);
    expect(began.velocity.x).toBeGreaterThan(0);
    expect(began.heading, "the same degrees a throw's angle is in").toBeCloseTo(0, 5);
    // And every report after it says where the finger is NOW, not where it started.
    expect(f.seen[1]!.translation.x).toBeCloseTo(0.8, 5);
    expect(f.seen[2]!.at.x).toBeCloseTo(0.5, 5);
    expect(f.seen[2]!.translation.x).toBeCloseTo(1, 5);
  });

  it("pan.a-finger-that-never-left-the-slop-says-nothing — a tap is not the shortest drag in history", () => {
    const f = panning();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 353, 302, { ms: 8 });
    f.fire("pointerup", 354, 301, { ms: 16 });
    expect(f.seen).toEqual([]);
  });

  it("pan.the-velocity-is-NOW-and-not-the-average — a dawdle and then a flick", () => {
    const f = panning();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 380, 300, { ms: 900 }); // began, having crawled
    f.fire("pointermove", 420, 300, { ms: 950 });
    f.fire("pointermove", 480, 300, { ms: 980 });
    const last = f.seen[f.seen.length - 1]!;
    // Over the whole gesture this finger managed about 1.3 units a SECOND. Over the window it is
    // going ten times that, and the window is what a throw is handed.
    expect(last.velocity.x).toBeGreaterThan(10);
  });

  it("pan.the-velocity-reads-every-coalesced-sample — half the readings of a flick are lost without them", () => {
    // On a 120 Hz screen the touches arrive twice as often as `pointermove` fires, and it is the
    // END of a flick — the fastest part — that loses the most. The same move, told twice: once as
    // the one reading the frame delivered, once as the readings the glass actually took.
    const plain = panning();
    plain.fire("pointerdown", 350, 300, { ms: 0 });
    plain.fire("pointermove", 380, 300, { ms: 100 });
    plain.fire("pointermove", 450, 300, { ms: 300 });
    const coalesced = panning();
    coalesced.fire("pointerdown", 350, 300, { ms: 0 });
    coalesced.fire("pointermove", 380, 300, { ms: 100 });
    coalesced.fire("pointermove", 450, 300, {
      ms: 300,
      coalesced: [
        { x: 380, y: 300, ms: 120 },
        { x: 380, y: 300, ms: 220 },
        { x: 450, y: 300, ms: 300 },
      ],
    });
    const one = plain.seen[plain.seen.length - 1]!.velocity.x;
    const all = coalesced.seen[coalesced.seen.length - 1]!.velocity.x;
    // The coalesced reading knows the finger stood still until 220 ms and then moved; the frame's
    // own single sample spreads that same move over the whole two hundred and reports a slower
    // hand than the one that was there.
    expect(all).toBeGreaterThan(one * 1.5);
  });

  it("pan.the-twist-of-the-wrist-is-measured-not-guessed — a curved flick has a sign, a straight one has none", () => {
    // A card thrown off a twisting hand spins about its own axis and arcs through the air, and both
    // come from ONE fact: how fast the heading is turning. The hand really did draw a curve, so it
    // is read off the readings rather than invented from a straight line.
    const straight = panning();
    straight.fire("pointerdown", 350, 300, { ms: 0 });
    for (let k = 1; k <= 6; k++) straight.fire("pointermove", 350 + k * 20, 300, { ms: k * 10 });
    expect(straight.seen[straight.seen.length - 1]!.curl, "a ruler has no twist").toBeCloseTo(0, 6);

    // The same hand, sweeping an arc: each step turns the heading by the same amount, one way.
    const arc = (sign: number) => {
      const f = panning();
      f.fire("pointerdown", 350, 300, { ms: 0 });
      // A quarter circle of radius 160 px, walked in twelve-degree steps: the same path for both,
      // mirrored about the line the hand set out along.
      const R = 160;
      for (let k = 1; k <= 8; k++) {
        const a = k * 12 * (Math.PI / 180);
        f.fire("pointermove", 350 + Math.sin(a) * R, 300 - sign * (1 - Math.cos(a)) * R, { ms: k * 10 });
      }
      return f.seen[f.seen.length - 1]!.curl;
    };
    const right = arc(1);
    const left = arc(-1);
    expect(Math.abs(right), "a real sweep really registers").toBeGreaterThan(60);
    expect(Math.sign(right), "and which way it went is which way it reads").toBe(-Math.sign(left));
    // A finger that has come down and not moved says nothing rather than something random.
    const still = panning();
    still.fire("pointerdown", 350, 300, { ms: 0 });
    still.fire("pointermove", 400, 300, { ms: 20 });
    expect(still.seen[0]!.curl).toBe(0);
  });

  it("pan.simultaneity-is-ONE-rule — the other hand is named, and whether it blocks is asked once", () => {
    // Two fingers with different roles is the ordinary table gesture, so by default a pan runs
    // beside another hand and merely REPORTS it.
    const open = panning();
    open.fire("pointerdown", 350, 300, { id: 1, ms: 0 }); // a hand rests on `left`
    open.fire("pointerdown", 450, 300, { id: 2, ms: 10 }); // the other deals off `right`
    open.fire("pointermove", 450, 240, { id: 2, ms: 30 });
    expect(open.seen.length).toBe(1);
    expect(open.seen[0]!.on.id).toBe("right");
    expect(open.seen[0]!.anchor?.on?.id, "the resting hand is named, not guessed at").toBe("left");
    // WHICH finger this report is about, so a page that starts something on `began` can tell the
    // finger that started it from the next one to arrive. A third finger's release must not end
    // the second finger's work.
    expect(open.seen[0]!.id).toBe(2);
    expect(open.seen[0]!.anchor?.drift).toBeCloseTo(0, 5);
    // AND WHICH HAND CAME FIRST, which is the whole of "one finger holds, the other deals". Both
    // fingers see each other as the other hand, so both pass any test written on the anchor alone —
    // and then a resting thumb that shifts ten pixels steals the gesture from the hand that meant
    // to make it, just by moving first.
    expect(open.seen[0]!.anchor?.earlier, "the resting hand was down before the dealing one").toBe(true);
    open.fire("pointermove", 350, 260, { id: 1, ms: 40 }); // now the RESTING hand moves too
    const holder = open.seen[open.seen.length - 1]!;
    expect(holder.id).toBe(1);
    expect(holder.anchor?.earlier, "and to the holder, the other hand is the LATER one").toBe(false);

    // A page with a genuine rival says so in one place — `shouldRecognizeSimultaneouslyWith` — and
    // not as a pile of conditions spread through a handler.
    const closed = panning({ together: (a) => a.on?.id !== "left" });
    closed.fire("pointerdown", 350, 300, { id: 1, ms: 0 });
    closed.fire("pointerdown", 450, 300, { id: 2, ms: 10 });
    closed.fire("pointermove", 450, 240, { id: 2, ms: 30 });
    closed.fire("pointerup", 450, 200, { id: 2, ms: 40 });
    expect(closed.seen, "refused before it began, so there is no ending to report either").toEqual([]);

    // ...and the question is asked ONCE, at the moment the pan begins: a hand that was allowed to
    // start is not taken off the piece halfway because the other finger moved.
    const started = panning({ together: (a) => a.on?.id !== "left" });
    started.fire("pointerdown", 450, 300, { id: 2, ms: 0 });
    started.fire("pointermove", 450, 240, { id: 2, ms: 20 }); // began, nobody else down
    started.fire("pointerdown", 350, 300, { id: 1, ms: 30 }); // the rival arrives afterwards
    started.fire("pointermove", 450, 180, { id: 2, ms: 40 });
    expect(started.seen.map((p) => p.state)).toEqual(["began", "changed"]);
  });

  it("pan.holds-the-finger-it-began-on — a hand that lifts off the canvas still ends its gesture", () => {
    // Without the capture, a finger that leaves the view and lifts THERE never sends its release
    // here: the gesture stays open forever, whatever it was carrying stays carried, and every
    // gesture after it is refused because the last one never ended. It reads as "it hangs
    // sometimes", and the way to make it happen is to do what people do — deal off the edge.
    const f = panning();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    expect(f.captured.has(1), "not before it is a pan — a resting finger is nobody's").toBe(false);
    f.fire("pointermove", 430, 300, { ms: 20 });
    expect(f.captured.has(1)).toBe(true);
    f.fire("pointerup", 9000, 9000, { ms: 40 }); // let go far outside the view
    expect(f.seen.map((p) => p.state)).toEqual(["began", "ended"]);
    expect(f.captured.has(1), "and it is handed back when the gesture is over").toBe(false);
    // The teardown lets go of anything still held: a page swapped mid-gesture must not leave the
    // view holding a finger nobody is listening to.
    const g = panning();
    g.fire("pointerdown", 350, 300, { ms: 0 });
    g.fire("pointermove", 430, 300, { ms: 20 });
    expect(g.captured.size).toBe(1);
    g.stop();
    expect(g.captured.size).toBe(0);
  });

  it("pan.a-cancel-is-not-a-release — the gesture is taken away, and where the pointer was put is not where the hand went", () => {
    const f = panning();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 430, 300, { ms: 30 });
    f.fire("pointercancel", 999, 999, { ms: 40 });
    expect(f.seen.map((p) => p.state)).toEqual(["began", "cancelled"]);
    expect(f.seen[1]!.at.x, "the last place the HAND was, not the one the system parked it at").toBeCloseTo(0.3, 5);
    // And the finger is forgotten: a further move on the same id says nothing.
    f.fire("pointermove", 300, 300, { ms: 60 });
    expect(f.seen.length).toBe(2);
  });
});

describe("the shake", () => {
  function shaking(): { fire: Fire; m: Shaking } {
    const b = bench();
    return { fire: b.fire, m: wireShake({ host: b.host, want: grabbable }) };
  }

  it("shake.it-is-a-reading-not-an-event — and it survives the finger leaving", () => {
    const f = shaking();
    expect(f.m.reading(), "nothing has been shaken yet").toBeUndefined();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 400, 300, { ms: 40 });
    expect(f.m.reading()?.on.id, "readable DURING the gesture — a piece may rattle as it is worked").toBe("left");
    f.fire("pointerup", 400, 300, { ms: 80 });
    expect(
      f.m.reading()?.walked,
      "and after it, so a release handler reads a finished shake whichever listener ran first",
    ).toBeCloseTo(0.5, 5);
  });

  it("shake.a-turn-is-a-reversal — the number that separates a shake from a throw", () => {
    const f = shaking();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 420, 300, { ms: 20 });
    f.fire("pointermove", 350, 300, { ms: 40 });
    f.fire("pointermove", 420, 300, { ms: 60 });
    f.fire("pointerup", 420, 300, { ms: 70 });
    expect(f.m.reading()!.turns).toBe(2);
  });

  it("shake.a-swipe-has-no-turns-at-all — same speed, same ground, different gesture", () => {
    const f = shaking();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 450, 300, { ms: 20 });
    f.fire("pointermove", 550, 300, { ms: 40 });
    f.fire("pointerup", 550, 300, { ms: 50 });
    const r = f.m.reading()!;
    expect(r.turns).toBe(0);
    expect(r.speed, "it is not slow — it is straight").toBeGreaterThan(3);
  });

  it("shake.a-tremble-is-not-a-turn — a resting hand rattles nothing", () => {
    const f = shaking();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    for (let i = 1; i <= 8; i++) f.fire("pointermove", 350 + (i % 2 === 0 ? 3 : -3), 300, { ms: i * 20 });
    f.fire("pointerup", 350, 300, { ms: 200 });
    expect(f.m.reading()!.turns, "three pixels each way is a hand holding still").toBe(0);
  });

  it("shake.the-axis-is-an-axis-not-a-direction — both ways round give one answer", () => {
    const there = shaking();
    there.fire("pointerdown", 350, 300, { ms: 0 });
    there.fire("pointermove", 550, 300, { ms: 20 });
    there.fire("pointerup", 550, 300, { ms: 30 });

    const back = shaking();
    back.fire("pointerdown", 350, 300, { ms: 0 });
    back.fire("pointermove", 150, 300, { ms: 20 });
    back.fire("pointerup", 150, 300, { ms: 30 });

    expect(there.m.reading()!.axis).toBeCloseTo(0, 5);
    expect(back.m.reading()!.axis, "a hand rattling left-right and right-left shook the same way").toBeCloseTo(0, 5);
  });

  it("shake.the-next-finger-clears-it — one reading per gesture, and it is the newest", () => {
    const f = shaking();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 550, 300, { ms: 20 });
    f.fire("pointerup", 550, 300, { ms: 30 });
    const hard = f.m.reading()!.walked;
    f.fire("pointerdown", 350, 300, { ms: 100 });
    expect(f.m.reading()!.walked, "the old work does not carry into the new gesture").toBe(0);
    expect(hard).toBeGreaterThan(0);
  });

  it("shake.speed-is-the-work-over-the-time — how hard, not how far", () => {
    const f = shaking();
    f.fire("pointerdown", 350, 300, { ms: 0 });
    f.fire("pointermove", 450, 300, { ms: 100 });
    f.fire("pointermove", 350, 300, { ms: 200 });
    f.fire("pointerup", 350, 300, { ms: 200 });
    // Two units walked in a fifth of a second.
    expect(f.m.reading()!.speed).toBeCloseTo(10, 5);
  });

  it("shake.a-second-finger-is-somebody-elses-gesture — the shake keeps the one it started with", () => {
    const f = shaking();
    f.fire("pointerdown", 350, 300, { id: 1, ms: 0 });
    f.fire("pointerdown", 450, 300, { id: 2, ms: 10 });
    f.fire("pointermove", 650, 300, { id: 2, ms: 30 });
    expect(f.m.reading()!.walked, "the other hand's travel is not this piece's shake").toBe(0);
  });
});

// A GESTURE WHOSE WHOLE CONTENT IS WORK has to be paid out as it is done. Everything below is that
// sentence, and the arbitration that keeps it off a deal.
describe("the knead", () => {
  function kneading(opts: { quantum?: number } = {}) {
    const b = bench();
    const seen: Knead[] = [];
    const stop = wireKnead({
      host: b.host,
      want: grabbable,
      onKnead: (k) => seen.push(k),
      ...(opts.quantum !== undefined ? { quantum: opts.quantum } : {}),
    });
    return { ...b, seen, stop };
  }

  /** Both fingers on the left piece, then both working back and forth across it. */
  function work(f: { fire: Fire }, passes: number): void {
    f.fire("pointerdown", 340, 300, { id: 1, ms: 0 });
    f.fire("pointerdown", 360, 300, { id: 2, ms: 10 });
    for (let i = 1; i <= passes; i++) {
      const d = i % 2 === 0 ? 0 : 60;
      f.fire("pointermove", 340 + d, 300, { id: 1, ms: 20 * i });
      f.fire("pointermove", 360 + d, 300, { id: 2, ms: 20 * i + 5 });
    }
  }

  it("knead.work-is-paid-out-as-it-is-done — quanta, not one call at the end", () => {
    const f = kneading({ quantum: 1 });
    work(f, 4);
    expect(f.seen.length, "the pack came apart under the fingers, not after them").toBeGreaterThan(1);
    expect(f.seen.map((k) => k.count), "and each one says how much work has been done in all").toEqual(
      f.seen.map((_, i) => i + 1),
    );
    expect(f.seen.every((k) => k.on.id === "left")).toBe(true);
  });

  it("knead.letting-go-is-always-the-last-word — even mid-quantum", () => {
    const f = kneading({ quantum: 1 });
    work(f, 3);
    f.fire("pointerup", 400, 300, { id: 2, ms: 200 });
    const last = f.seen[f.seen.length - 1]!;
    expect(last.done, "a consumer owes the player something for having stopped").toBe(true);
    expect(f.seen.filter((k) => k.done).length, "and exactly once").toBe(1);
  });

  it("knead.one-finger-holding-is-a-deal-not-a-knead — the arbitration, from this side", () => {
    // The other half of `swipe.the-other-finger-is-reported-as-an-anchor`: the same two fingers on
    // the same pack, and only their ROLES decide which gesture this is.
    const f = kneading({ quantum: 1 });
    f.fire("pointerdown", 340, 300, { id: 1, ms: 0 });
    f.fire("pointerdown", 360, 300, { id: 2, ms: 10 });
    for (let i = 1; i <= 6; i++) f.fire("pointermove", 360 + i * 40, 300, { id: 2, ms: 20 * i });
    f.fire("pointerup", 600, 300, { id: 2, ms: 200 });
    expect(f.seen, "one hand did all the travelling, so nothing was kneaded").toEqual([]);
  });

  it("knead.a-quantum-is-ground-and-not-time — a slow knead does the same work per pass", () => {
    const slow = kneading({ quantum: 1 });
    slow.fire("pointerdown", 340, 300, { id: 1, ms: 0 });
    slow.fire("pointerdown", 360, 300, { id: 2, ms: 10 });
    slow.fire("pointermove", 400, 300, { id: 1, ms: 900 });
    slow.fire("pointermove", 420, 300, { id: 2, ms: 1800 });
    expect(slow.seen.length, "1.2 units of ground, however long the hand took over it").toBe(1);
  });

  it("knead.a-pair-that-never-worked-says-nothing-at-all", () => {
    const f = kneading({ quantum: 1 });
    f.fire("pointerdown", 340, 300, { id: 1, ms: 0 });
    f.fire("pointerdown", 360, 300, { id: 2, ms: 10 });
    f.fire("pointerup", 340, 300, { id: 1, ms: 300 });
    expect(f.seen, "two fingers resting on a pack is a hand on a pack").toEqual([]);
  });

  it("knead.the-first-finger-names-the-subject — not whichever the browser reported last", () => {
    const f = kneading({ quantum: 1 });
    f.fire("pointerdown", 350, 300, { id: 1, ms: 0 }); // the left piece
    f.fire("pointerdown", 450, 300, { id: 2, ms: 10 }); // the right one
    for (let i = 1; i <= 4; i++) {
      const d = i % 2 === 0 ? 0 : 50;
      f.fire("pointermove", 350 + d, 300, { id: 1, ms: 20 * i });
      f.fire("pointermove", 450 + d, 300, { id: 2, ms: 20 * i + 5 });
    }
    expect(f.seen.length).toBeGreaterThan(0);
    expect(f.seen.every((k) => k.on.id === "left")).toBe(true);
  });
});
