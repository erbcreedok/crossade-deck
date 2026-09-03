// @vitest-environment jsdom
// THE OTHER SCREEN'S HAND — what `follow` does to a scene that did not start the carry.
import { describe, expect, it } from "vitest";
import { type Painter } from "../../src/index.js";
import { chessMap, chessRoom, CHESS_UNIT, squareAt } from "./chessMap.js";
import { follow, type Screen } from "./liveScreens.js";
import { scene as buildScene } from "../devtools/scene.js";
import { currentSettings } from "../devtools/catalogSettings.js";

describe("a hand mirrored onto another screen", () => {
  it("live.the-far-screen-moves-the-piece-the-near-hand-is-holding — not only the cursor", () => {
    // Told a carry, the far screen has to DRAW it: the man leaves his square and rides the anchor
    // there exactly as he does under the finger. Without that the far screen shows a cursor gliding
    // about and the man standing perfectly still — which is what the board did, because a desk
    // without stacking never wrote the run the mirror was handed, and the mirror was handed nothing.
    const desk = chessMap();
    // A painter that COUNTS: an override is a number in the clock until a frame paints it, and the
    // far screen's clock is woken by its own gestures only. What this proves is the frame.
    let drawn = 0;
    const stub = (): Painter => ({ ready: Promise.resolve(), draw: () => { drawn += 1; }, resize: () => {}, destroy: () => {} });
    // With a camera, as every live pane has one: the cursor is a picture on the GLASS and needs the
    // view to know where the far hand is on it.
    // ...AND A CLOCK DRIVEN BY HAND, because "the far screen moves him" is a claim about FRAMES: the
    // anchor is a target the springs chase, and a scene whose loop never stepped would hold the man at
    // the point he was grabbed at for the whole carry — which is exactly what a cursor gliding over
    // a still board looks like, and what a burst of moves with no frame between them showed.
    let now = 0;
    let frame: ((ms: number) => void) | null = null;
    const clock = { now: () => now, frame: (cb: (ms: number) => void) => { frame = cb; return () => { frame = null; }; } };
    const tick = (n: number): void => { for (let i = 0; i < n && frame; i += 1) { now += 16; const cb = frame; frame = null; cb(now); } };
    const far = buildScene(desk, { animate: true, motion: { clock }, camera: { limits: { minZoom: 0.5, maxZoom: 2.5 }, content: chessRoom(), unit: CHESS_UNIT } }, currentSettings(), stub);
    document.body.appendChild(far.el);
    const dot = document.createElement("div");
    const screen: Screen = { seat: "black", ink: "alert", dot, scene: far };
    const pawn = squareAt(desk, { x: 0.5, y: 2.5 })!.children[0]!;
    const rest = far.motions!.poses()?.get(pawn.id);
    expect(rest, "nothing is carried yet, so nothing is overridden").toBeUndefined();
    // The near hand reports: this man, at this anchor.
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], { x: 0.5, y: 0.5 }, false, 1.3, {});
    // The SECOND report steers an existing carry — no grab, only a new anchor — and that is the path
    // with no frame of its own: the grab happened to paint one, and every move after it did not.
    const before = drawn;
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], { x: 0.5, y: -0.5 }, false, 1.3, {});
    const carried = far.motions!.poses()?.get(pawn.id);
    expect(carried, "the far screen now holds him off his square").toBeDefined();
    // Told a new anchor, the far screen has a frame to run: the loop is armed, and once it has
    // stepped the man is drawn AT the new anchor, not where the hand first closed on him — PAINTED
    // by that frame, and not by an extra plan on every move: a steer costs no paint of its own.
    expect(frame, "a frame is asked for — the springs have somewhere to go").not.toBeNull();
    expect(drawn, "and the steer itself paints nothing — the frame will").toBe(before);
    tick(60);
    expect(drawn, "the frames PAINTED it — a carry nobody drew is a cursor over a still board").toBeGreaterThan(before);
    const rode = far.motions!.poses()?.get(pawn.id)!;
    expect(rode.e, "rides the anchor: x").toBeCloseTo(0.5, 2);
    expect(rode.f, "rides the anchor: y").toBeCloseTo(-0.5, 2);
    expect(dot.style.display, "and the other hand is shown").toBe("block");
    // The near hand lets go: the far screen lets go too, and its cursor is gone.
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], undefined, true, 1.3, {});
    expect(screen.mirroring, "nothing mirrored any more").toBeUndefined();
    expect(dot.style.display).toBe("none");
    far.dispose();
  });
});
