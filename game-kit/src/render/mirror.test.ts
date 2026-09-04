// @vitest-environment jsdom
// THE OTHER SCREEN'S HAND — what `follow` does to a scene that did not start the carry.

import { describe, expect, it } from "vitest";
import {
  add,
  attachMotion,
  Bounded,
  Container,
  freeLayout,
  mount,
  node,
  rect,
  registerLayout,
  Transformable,
  type Painter,
} from "../index.js";
import { Camera } from "./camera/index.js";
import { follow, type Screen } from "./mirror.js";

function stubPainter(onDraw: () => void): Painter {
  return { ready: Promise.resolve(), draw: onDraw, resize: () => {}, destroy: () => {} };
}

describe("a hand mirrored onto another screen", () => {
  it("mirror.the-far-screen-moves-the-piece-the-near-hand-is-holding — not only the cursor", () => {
    registerLayout("mirror.free", freeLayout);
    const root = node("desk", Container({ layout: "mirror.free" }));
    const pawn = node("pawn", Bounded({ bounds: rect(1, 1) }), Transformable({ at: { x: 0.5, y: 2.5 } }));
    add(root, pawn);

    let drawn = 0;
    let now = 0;
    let frame: ((ms: number) => void) | null = null;
    const clock = { now: () => now, frame: (cb: (ms: number) => void) => { frame = cb; return () => { frame = null; }; } };
    const tick = (n: number): void => { for (let i = 0; i < n && frame; i += 1) { now += 16; const cb = frame; frame = null; cb(now); } };

    const div = document.createElement("div");
    const host = mount(div, root, { hudUnit: 64, theme: "dark" });
    const motions = attachMotion(host, stubPainter(() => { drawn += 1; }), { clock });
    const camera = new Camera({ minZoom: 0.5, maxZoom: 2.5 });

    const cursor: { at: { x: number; y: number } | undefined } = { at: undefined };
    const screen: Screen = {
      seat: "black",
      scene: { host, motions, camera },
      onCursor: (at) => { cursor.at = at; },
    };

    const rest = motions.poses()?.get(pawn.id);
    expect(rest, "nothing is carried yet, so nothing is overridden").toBeUndefined();

    // The near hand reports: this man, at this anchor.
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], { x: 0.5, y: 0.5 }, false, 1.3, {});
    // The SECOND report steers an existing carry — no grab, only a new anchor — and that is the path
    // with no frame of its own: the grab happened to paint one, and every move after it did not.
    const before = drawn;
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], { x: 0.5, y: -0.5 }, false, 1.3, {});
    const carried = motions.poses()?.get(pawn.id);
    expect(carried, "the far screen now holds him off his square").toBeDefined();
    expect(frame, "a frame is asked for — the springs have somewhere to go").not.toBeNull();
    expect(drawn, "and the steer itself paints nothing — the frame will").toBe(before);
    tick(60);
    expect(drawn, "the frames PAINTED it — a carry nobody drew is a cursor over a still board").toBeGreaterThan(before);
    const rode = motions.poses()?.get(pawn.id)!;
    expect(rode.e, "rides the anchor: x").toBeCloseTo(0.5, 2);
    expect(rode.f, "rides the anchor: y").toBeCloseTo(-0.5, 2);
    expect(cursor.at, "and the other hand is shown").toEqual({ x: 0.5, y: -0.5 });

    // The near hand lets go: the far screen lets go too, and its cursor is gone.
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], undefined, true, 1.3, {});
    expect(screen.mirroring, "nothing mirrored any more").toBeUndefined();
    expect(cursor.at).toBeUndefined();
  });

  it("mirror.two-screens-two-hands-moving-one-does-not-affect-the-other — two screens, two hands drag independently", () => {
    registerLayout("mirror.free2", freeLayout);
    const buildRoot = (): { root: ReturnType<typeof node>; pawnWhite: string; pawnBlack: string } => {
      const root = node("desk", Container({ layout: "mirror.free2" }));
      const white = node("white", Bounded({ bounds: rect(1, 1) }), Transformable({ at: { x: 0.5, y: 2.5 } }));
      const black = node("black", Bounded({ bounds: rect(1, 1) }), Transformable({ at: { x: 1.5, y: -2.5 } }));
      add(root, white);
      add(root, black);
      return { root, pawnWhite: white.id, pawnBlack: black.id };
    };

    let now = 0;
    let frameA: ((ms: number) => void) | null = null;
    let frameB: ((ms: number) => void) | null = null;
    const clockA = { now: () => now, frame: (cb: (ms: number) => void) => { frameA = cb; return () => { frameA = null; }; } };
    const clockB = { now: () => now, frame: (cb: (ms: number) => void) => { frameB = cb; return () => { frameB = null; }; } };
    const tick = (n: number): void => {
      for (let i = 0; i < n; i += 1) {
        now += 16;
        const cbA = frameA; frameA = null; cbA?.(now);
        const cbB = frameB; frameB = null; cbB?.(now);
      }
    };

    const { root: rootA, pawnWhite, pawnBlack } = buildRoot();
    const rootB = rootA;
    const hostA = mount(document.createElement("div"), rootA, { hudUnit: 64, theme: "dark" });
    const hostB = mount(document.createElement("div"), rootB, { hudUnit: 64, theme: "dark" });
    const motionsA = attachMotion(hostA, stubPainter(() => {}), { clock: clockA });
    const motionsB = attachMotion(hostB, stubPainter(() => {}), { clock: clockB });

    const screenA: Screen = { seat: "white", scene: { host: hostA, motions: motionsA } };
    const screenB: Screen = { seat: "black", scene: { host: hostB, motions: motionsB } };

    // Screen A grabs white pawn locally and mirrors to screen B
    motionsA.grab([{ id: pawnWhite, offset: { x: 0, y: 0 } }], { anchor: { x: 0.5, y: 1.0 }, hand: "local" });
    follow(screenB, [{ id: pawnWhite, offset: { x: 0, y: 0 } }], { x: 0.5, y: 1.0 }, false, 1.3, {}, "white");

    // Screen B grabs black pawn locally and mirrors to screen A
    motionsB.grab([{ id: pawnBlack, offset: { x: 0, y: 0 } }], { anchor: { x: 1.5, y: -1.0 }, hand: "local" });
    follow(screenA, [{ id: pawnBlack, offset: { x: 0, y: 0 } }], { x: 1.5, y: -1.0 }, false, 1.3, {}, "black");

    // Move screen A's hand
    motionsA.dragTo({ x: 0.5, y: 0.0 }, "local");
    follow(screenB, [{ id: pawnWhite, offset: { x: 0, y: 0 } }], { x: 0.5, y: 0.0 }, false, 1.3, {}, "white");

    // Move screen B's hand
    motionsB.dragTo({ x: 1.5, y: 0.0 }, "local");
    follow(screenA, [{ id: pawnBlack, offset: { x: 0, y: 0 } }], { x: 1.5, y: 0.0 }, false, 1.3, {}, "black");

    tick(60);

    const posWhiteOnA = motionsA.poses()?.get(pawnWhite)!;
    const posBlackOnA = motionsA.poses()?.get(pawnBlack)!;
    expect(posWhiteOnA.e).toBeCloseTo(0.5, 2);
    expect(posWhiteOnA.f).toBeCloseTo(0.0, 2);
    expect(posBlackOnA.e).toBeCloseTo(1.5, 2);
    expect(posBlackOnA.f).toBeCloseTo(0.0, 2);

    const posWhiteOnB = motionsB.poses()?.get(pawnWhite)!;
    const posBlackOnB = motionsB.poses()?.get(pawnBlack)!;
    expect(posWhiteOnB.e).toBeCloseTo(0.5, 2);
    expect(posWhiteOnB.f).toBeCloseTo(0.0, 2);
    expect(posBlackOnB.e).toBeCloseTo(1.5, 2);
    expect(posBlackOnB.f).toBeCloseTo(0.0, 2);
  });
});
