// @vitest-environment jsdom
// THE OTHER SCREEN'S HAND — what `follow` does to a scene that did not start the carry.
import { describe, expect, it } from "vitest";
import { mark, visibleMark, type Painter, type ViewerSettings } from "../../src/index.js";
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

  it("live.two-screens-two-hands-moving-one-does-not-affect-the-other — two screens, two hands drag independently", () => {
    const desk = chessMap();
    let drawnA = 0;
    let drawnB = 0;
    const stubA = (): Painter => ({ ready: Promise.resolve(), draw: () => { drawnA += 1; }, resize: () => {}, destroy: () => {} });
    const stubB = (): Painter => ({ ready: Promise.resolve(), draw: () => { drawnB += 1; }, resize: () => {}, destroy: () => {} });
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
    const sceneA = buildScene(desk, { animate: true, motion: { clock: clockA }, camera: { limits: { minZoom: 0.5, maxZoom: 2.5 }, content: chessRoom(), unit: CHESS_UNIT } }, currentSettings(), stubA);
    const sceneB = buildScene(desk, { animate: true, motion: { clock: clockB }, camera: { limits: { minZoom: 0.5, maxZoom: 2.5 }, content: chessRoom(), unit: CHESS_UNIT } }, currentSettings(), stubB);
    document.body.appendChild(sceneA.el);
    document.body.appendChild(sceneB.el);
    const dotA = document.createElement("div");
    const dotB = document.createElement("div");
    const screenA: Screen = { seat: "white", ink: "action", dot: dotA, scene: sceneA };
    const screenB: Screen = { seat: "black", ink: "alert", dot: dotB, scene: sceneB };

    const pawnWhite = squareAt(desk, { x: 0.5, y: 2.5 })!.children[0]!;
    const pawnBlack = squareAt(desk, { x: 1.5, y: -2.5 })!.children[0]!;

    // Screen A grabs white pawn locally and mirrors to screen B
    sceneA.motions!.grab([{ id: pawnWhite.id, offset: { x: 0, y: 0 } }], { anchor: { x: 0.5, y: 1.0 }, hand: "local" });
    follow(screenB, [{ id: pawnWhite.id, offset: { x: 0, y: 0 } }], { x: 0.5, y: 1.0 }, false, 1.3, {}, "white");

    // Screen B grabs black pawn locally and mirrors to screen A
    sceneB.motions!.grab([{ id: pawnBlack.id, offset: { x: 0, y: 0 } }], { anchor: { x: 1.5, y: -1.0 }, hand: "local" });
    follow(screenA, [{ id: pawnBlack.id, offset: { x: 0, y: 0 } }], { x: 1.5, y: -1.0 }, false, 1.3, {}, "black");

    // Move screen A's hand
    sceneA.motions!.dragTo({ x: 0.5, y: 0.0 }, "local");
    follow(screenB, [{ id: pawnWhite.id, offset: { x: 0, y: 0 } }], { x: 0.5, y: 0.0 }, false, 1.3, {}, "white");

    // Move screen B's hand
    sceneB.motions!.dragTo({ x: 1.5, y: 0.0 }, "local");
    follow(screenA, [{ id: pawnBlack.id, offset: { x: 0, y: 0 } }], { x: 1.5, y: 0.0 }, false, 1.3, {}, "black");

    tick(60);

    // On scene A: pawnWhite is at 0.5, 0.0; pawnBlack is at 1.5, 0.0
    const posWhiteOnA = sceneA.motions!.poses()?.get(pawnWhite.id)!;
    const posBlackOnA = sceneA.motions!.poses()?.get(pawnBlack.id)!;
    expect(posWhiteOnA.e).toBeCloseTo(0.5, 2);
    expect(posWhiteOnA.f).toBeCloseTo(0.0, 2);
    expect(posBlackOnA.e).toBeCloseTo(1.5, 2);
    expect(posBlackOnA.f).toBeCloseTo(0.0, 2);

    // On scene B: pawnWhite is at 0.5, 0.0; pawnBlack is at 1.5, 0.0
    const posWhiteOnB = sceneB.motions!.poses()?.get(pawnWhite.id)!;
    const posBlackOnB = sceneB.motions!.poses()?.get(pawnBlack.id)!;
    expect(posWhiteOnB.e).toBeCloseTo(0.5, 2);
    expect(posWhiteOnB.f).toBeCloseTo(0.0, 2);
    expect(posBlackOnB.e).toBeCloseTo(1.5, 2);
    expect(posBlackOnB.f).toBeCloseTo(0.0, 2);

    sceneA.dispose();
    sceneB.dispose();
  });

  it("live.action-marks-and-ttl-on-bottom-screen — own mark shown on top screen, expires after 5s on bottom screen", () => {
    const desk = chessMap();
    const inks = { white: "accent", black: "alert" };
    const topViewer: Partial<ViewerSettings> = { marks: { inks, showOwn: true } };
    const bottomViewer: Partial<ViewerSettings> = { marks: { inks, ttlMs: 5000, showOwn: false, me: "black" } };

    const stub = (): Painter => ({ ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} });
    const sceneTop = buildScene(
      desk,
      { animate: true, actor: "white", viewer: topViewer, camera: { limits: { minZoom: 0.5, maxZoom: 2.5 }, content: chessRoom(), unit: CHESS_UNIT } },
      currentSettings(),
      stub,
    );
    const sceneBottom = buildScene(
      desk,
      { animate: true, actor: "black", viewer: bottomViewer, camera: { limits: { minZoom: 0.5, maxZoom: 2.5 }, content: chessRoom(), unit: CHESS_UNIT } },
      currentSettings(),
      stub,
    );

    let pawn = squareAt(desk, { x: 0.5, y: 2.5 })!.children[0]!;
    const now = 10000;

    // White moves a pawn -> write mark
    pawn = mark(pawn, { by: "white", mark: "moved", from: { x: 0.5, y: 2.5 }, at: now });

    // Top screen (white's own screen with showOwn: true): mark is visible
    const topMark = visibleMark(pawn, sceneTop.host.viewer(), now);
    expect(topMark).toBeDefined();
    expect(topMark?.by).toBe("white");
    expect(topMark?.mark).toBe("moved");

    // Bottom screen (black's screen, white is opponent, ttlMs: 5000): mark is visible at now + 2000
    const bottomMarkInitial = visibleMark(pawn, sceneBottom.host.viewer(), now + 2000);
    expect(bottomMarkInitial).toBeDefined();
    expect(bottomMarkInitial?.by).toBe("white");

    // Bottom screen at now + 5001ms: mark expired
    const bottomMarkExpired = visibleMark(pawn, sceneBottom.host.viewer(), now + 5001);
    expect(bottomMarkExpired).toBeUndefined();

    // Top screen at now + 5001ms: mark is STILL visible (no ttlMs set for top screen)
    const topMarkAfter5s = visibleMark(pawn, sceneTop.host.viewer(), now + 5001);
    expect(topMarkAfter5s).toBeDefined();

    // Black (bottom screen) moves a pawn -> mark created by "black"
    let blackPawn = squareAt(desk, { x: 0.5, y: -2.5 })!.children[0]!;
    blackPawn = mark(blackPawn, { by: "black", mark: "moved", from: { x: 0.5, y: -2.5 }, at: now });

    // Bottom screen (me: "black", showOwn: false): black's own mark is NOT visible on bottom screen
    const bottomOwnMark = visibleMark(blackPawn, sceneBottom.host.viewer(), now);
    expect(bottomOwnMark).toBeUndefined();

    // Top screen (white's screen, showOwn: true): black's mark IS visible on top screen
    const topOpponentMark = visibleMark(blackPawn, sceneTop.host.viewer(), now);
    expect(topOpponentMark).toBeDefined();
    expect(topOpponentMark?.by).toBe("black");

    sceneTop.dispose();
    sceneBottom.dispose();
  });
});
