// @vitest-environment jsdom

// The dice add-on: its kinds, its skin, its builder — and the three throws, played on the engine's
// motion runtime with a fake clock, so a die's landing is asserted, not eyeballed.

import { describe, expect, it } from "vitest";
import {
  add,
  assetRecord,
  attachMotion,
  Container,
  faceOf,
  fieldsOf,
  freeLayout,
  installStockEasings,
  installStockSurfaces,
  mount,
  node,
  registerLayout,
  resetAssets,
  sidesOf,
  surfaceRecord,
  Bounded,
  Transformable,
  rect,
  type Clock,
  type Painter,
  type Quad,
  type SurfacedFields,
  type TransformableFields,
} from "game-kit";
import { DIE_KINDS, dieSpec } from "./kinds.js";
import { faceSvg } from "./textures/dice.js";
import { faceSurface, installDiceSkin } from "./skin.classic.js";
import { die, kindOf, outcomeOf, rollDie, showFace, throwDie, throwFromCarry, wallsOf } from "./dice.js";

function fakeClock() {
  let now = 0;
  let pending: (() => void) | null = null;
  const clock: Clock = { now: () => now, frame: (cb) => { pending = cb; return () => { pending = null; }; } };
  return { clock, idle: () => pending === null, tick(at: number) { now = at; const cb = pending; pending = null; cb?.(); } };
}

function bench() {
  resetAssets();
  installStockSurfaces();
  installStockEasings();
  registerLayout("free", freeLayout);
  const desk = node("desk", Container({ layout: "free" }));
  const d = die("d6", { kind: "d6", at: { x: 0, y: 0 }, face: 2 });
  add(desk, d);
  let last: readonly Quad[] = [];
  const painter: Painter = { ready: Promise.resolve(), draw: (plan) => { last = plan; }, resize: () => {}, destroy: () => {} };
  const host = mount(document.createElement("div"), desk);
  const xOf = (id: string): number => last.find((q) => q.id === id)!.x;
  return { desk, d, host, painter, xOf };
}

describe("kinds, skin, builder", () => {
  it("dice.kinds-are-data — three kinds, each with its sides and a centred silhouette", () => {
    expect(DIE_KINDS).toEqual(["d4", "d6", "d20"]);
    expect(dieSpec("d4").sides).toBe(4);
    expect(dieSpec("d6").sides).toBe(6);
    expect(dieSpec("d20").sides).toBe(20);
    for (const k of DIE_KINDS) expect(dieSpec(k).shape.segments.length).toBeGreaterThanOrEqual(2);
  });

  it("dice.every-face-has-a-picture — a data URI per (kind, value), distinct across values", () => {
    for (const k of DIE_KINDS) {
      const seen = new Set<string>();
      for (let v = 1; v <= dieSpec(k).sides; v++) {
        const uri = faceSvg(k, v);
        expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
        seen.add(uri);
      }
      expect(seen.size).toBe(dieSpec(k).sides);
    }
  });

  it("dice.the-skin-registers-every-face — 30 surfaces and 30 assets under speaking names", () => {
    resetAssets();
    installDiceSkin();
    let count = 0;
    for (const k of DIE_KINDS) {
      for (let v = 1; v <= dieSpec(k).sides; v++) {
        const name = faceSurface(k, v);
        expect(surfaceRecord(name)).toBeDefined();
        expect(assetRecord(name)?.src.startsWith("data:")).toBe(true);
        count++;
      }
    }
    expect(count).toBe(30);
  });

  it("dice.die-builds-the-node — silhouette, seat, face surface, values, sides, draggable, casts", () => {
    const d = die("k", { kind: "d20", at: { x: 1, y: 2 }, face: 17 });
    expect(sidesOf(d)).toBe(20);
    expect(faceOf(d)).toBe(17);
    expect(kindOf(d)).toBe("d20");
    expect(fieldsOf<SurfacedFields>(d, "Surfaced")?.surface).toBe(faceSurface("d20", 17));
    expect(fieldsOf<TransformableFields>(d, "Transformable")?.at).toEqual({ x: 1, y: 2 });
    for (const cap of ["Bounded", "Draggable", "Rollable", "ShadowCaster", "Valued"]) expect(d.atoms.has(cap)).toBe(true);
    // showFace writes truth and picture together
    showFace(d, 3);
    expect(faceOf(d)).toBe(3);
    expect(fieldsOf<SurfacedFields>(d, "Surfaced")?.surface).toBe(faceSurface("d20", 3));
    expect(() => showFace(d, 21)).toThrow();
  });
});

describe("outcomes", () => {
  it("dice.outcome-is-one-door — a number passes as is, a seed repeats, an rng draws; a bad number refuses", () => {
    expect(outcomeOf(6, 4)).toBe(4);
    expect(() => outcomeOf(6, 7)).toThrow(/6-sided/);
    expect(() => outcomeOf(6, 0)).toThrow();
    expect(outcomeOf(20, { seed: 99 })).toBe(outcomeOf(20, { seed: 99 })); // every client agrees
    const a = outcomeOf(20, { seed: 1 }), b = outcomeOf(20, { seed: 2 });
    expect([a, b].every((f) => f >= 1 && f <= 20)).toBe(true);
    let calls = 0;
    expect(outcomeOf(4, { rng: () => { calls++; return 0.99; } })).toBe(4);
    expect(calls).toBe(1);
  });
});

describe("the throws, on the one clock", () => {
  it("dice.roll-tumbles-and-shows-the-face — decided now, shown when the tumble commits", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { rollMs: 100, clock: c.clock });
    let shown: number | undefined;
    const face = rollDie(m, b.d, { outcome: 5, onFace: (f) => { shown = f; } });
    expect(face).toBe(5);
    expect(faceOf(b.d)).toBe(2); // not yet: the tumble is playing
    c.tick(50);
    expect(shown).toBeUndefined();
    c.tick(80);
    expect(shown).toBe(5);
    expect(faceOf(b.d)).toBe(5);
    expect(fieldsOf<SurfacedFields>(b.d, "Surfaced")?.surface).toBe(faceSurface("d6", 5));
    c.tick(100);
    expect(c.idle()).toBe(true);
  });

  it("dice.a-tumbling-die-keeps-changing-its-face — the picture goes over and over, the truth exactly once", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { rollMs: 900, clock: c.clock });
    const pictures: string[] = [];
    const truths: (number | undefined)[] = [];
    rollDie(m, b.d, { outcome: 5 });
    for (let t = 8; t <= 912; t += 8) {
      c.tick(t);
      pictures.push(fieldsOf<SurfacedFields>(b.d, "Surfaced")!.surface!);
      truths.push(faceOf(b.d));
    }
    const changes = pictures.filter((s, i) => i > 0 && s !== pictures[i - 1]).length;
    // A face every time it goes over — a dozen of them for two turns, not one late swap.
    expect(changes).toBeGreaterThan(8);
    expect(new Set(pictures).size).toBeGreaterThan(3); // and it walks the die, not two faces back and forth
    // The truth waits: 2 all the way, then 5, once. A rule reading the die mid-throw is never told
    // a number nobody rolled.
    expect(truths.filter((f, i) => i > 0 && f !== truths[i - 1]).length).toBe(1);
    expect(truths[0]).toBe(2);
    // ...and by then the PICTURE had long since left the old face: most of the flicker happens
    // while the die still says 2, which is the whole difference from one swap near the end.
    const settled = truths.findIndex((f) => f === 5);
    expect(pictures.filter((s, i) => i > 0 && i < settled && s !== pictures[i - 1]).length).toBeGreaterThan(4);
    expect(faceOf(b.d)).toBe(5);
    expect(fieldsOf<SurfacedFields>(b.d, "Surfaced")?.surface).toBe(faceSurface("d6", 5));
    expect(c.idle()).toBe(true);
  });

  it("dice.a-thrown-die-shows-its-result-before-it-stops — the last face of the slide, not a swap at rest", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { friction: 6, spinFriction: 540, clock: c.clock });
    let at = 0;
    let rested = -1;
    const face = throwDie(m, b.desk, b.d, { speed: 6, angle: 0, spin: 720, outcome: 4, onRest: () => { rested = at; } });
    let shownAt = -1;
    let xWhenShown = 0;
    let changes = 0;
    let was = fieldsOf<SurfacedFields>(b.d, "Surfaced")!.surface;
    for (at = 8; at <= 3000 && rested < 0; at += 8) {
      c.tick(at);
      const now = fieldsOf<SurfacedFields>(b.d, "Surfaced")!.surface;
      if (now !== was) changes++;
      was = now;
      if (shownAt < 0 && now === faceSurface("d6", face)) {
        shownAt = at;
        xWhenShown = b.xOf("d6");
      }
    }
    expect(rested).toBeGreaterThan(0);
    expect(changes).toBeGreaterThan(8); // it tumbles the whole way across, on its own travel
    expect(shownAt).toBeGreaterThan(0);
    expect(shownAt).toBeLessThan(rested); // the result is on the glass BEFORE the die stops
    expect(Math.abs(b.xOf("d6") - xWhenShown)).toBeGreaterThan(0.05); // and it was still going
    expect(faceOf(b.d)).toBe(4);
  });

  it("dice.throw-slides-and-lands-in-the-tree — the seat and turn are written where it stopped, the face shown", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { friction: 6, spinFriction: 720, clock: c.clock });
    let rested: number | undefined;
    const face = throwDie(m, b.desk, b.d, { speed: 3, angle: 0, spin: 360, outcome: { seed: 7 }, onRest: (f) => { rested = f; } });
    for (let t = 16; t <= 3000 && rested === undefined; t += 16) c.tick(t);
    expect(rested).toBe(face);
    expect(faceOf(b.d)).toBe(face);
    const pose = fieldsOf<TransformableFields>(b.d, "Transformable")!;
    expect(pose.at.x).toBeGreaterThan(0.5); // it travelled and STAYED: the tree holds the landing
    expect(pose.angle).toBeGreaterThan(60);
    // The glass agrees with the tree: after the override went, the die draws at its new seat.
    b.host.setRoot(b.desk);
    expect(b.xOf("d6")).toBeGreaterThan(0);
    expect(c.idle()).toBe(true);
  });

  it("dice.throw-lands-in-the-owners-units — a die in a moved tray is written relative to the tray", () => {
    const b = bench();
    const tray = node("tray", Bounded({ bounds: rect(4, 4) }), Container({ layout: "free" }), Transformable({ at: { x: 3, y: 0 } }));
    add(b.desk, tray);
    const d2 = die("d4", { kind: "d4", at: { x: 0, y: 0 } });
    add(tray, d2);
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { friction: 6, clock: c.clock });
    let rested = false;
    throwDie(m, b.desk, d2, { speed: 2, angle: 0, outcome: 3, walls: wallsOf(b.desk, tray), onRest: () => { rested = true; } });
    for (let t = 16; t <= 3000 && !rested; t += 16) c.tick(t);
    const at = fieldsOf<TransformableFields>(d2, "Transformable")!.at;
    // Root x is about 3 + 0.33; written in the TRAY's units it is about 0.33, and inside the walls.
    expect(at.x).toBeGreaterThan(0.1);
    expect(at.x).toBeLessThan(2);
    expect(faceOf(d2)).toBe(3);
  });

  it("dice.throw-from-carry-inherits-the-finger — a fast release flies and TUMBLES, a slow one is a drop", () => {
    const b = bench();
    const c = fakeClock();
    const m = attachMotion(b.host, b.painter, { clock: c.clock });
    m.grab([{ id: "d6", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 } });
    m.dragTo({ x: 10, y: 0 });
    c.tick(16);
    c.tick(32);
    // A fifth of the finger's speed: the flick in this bench is violent, and a die that slides for
    // twenty seconds proves the same thing more slowly.
    const face = throwFromCarry(m, b.desk, b.d, { outcome: 6, gain: 0.2 });
    expect(face).toBe(6); // it flew, at the finger's speed
    // ...and it went OVER on the way: a hand flicks a die, it does not shove it flat. The turn is
    // the throw's own speed, and it takes the hand's direction — thrown right, it rolls right.
    let turned = 0;
    for (let t = 48; t <= 3000 && !c.idle(); t += 16) {
      c.tick(t);
      turned = Math.max(turned, Math.abs(fieldsOf<TransformableFields>(b.d, "Transformable")?.angle ?? 0));
    }
    expect(turned).toBeGreaterThan(180);
    expect(fieldsOf<TransformableFields>(b.d, "Transformable")!.angle!).toBeGreaterThan(0);
    // A slow release: nothing carried after the throw, so a second call is a drop.
    expect(throwFromCarry(m, b.desk, b.d, { outcome: 6 })).toBeUndefined();
  });
});
