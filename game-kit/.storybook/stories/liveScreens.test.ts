// @vitest-environment jsdom
// THE OTHER SCREEN'S HAND — what `follow` does to a scene that did not start the carry.
import { describe, expect, it } from "vitest";
import { mark, visibleMark, type Painter, type ViewerSettings } from "../../src/index.js";
import { chessMap, chessRoom, CHESS_UNIT, squareAt } from "@game-presets/desks";
import { follow, type Screen } from "./liveScreens.js";
import { scene as buildScene } from "../devtools/scene.js";
import { currentSettings } from "../devtools/catalogSettings.js";

describe("a hand mirrored onto another screen", () => {
  it("live.the-dot-follows-the-anchor-through-the-cameras-own-view — the wrapper, not the mechanics", () => {
    // The mechanics of `follow` (steering, the frame, the release) are the kit's own and are proved
    // in `src/render/mirror.test.ts`. What is left HERE, in the catalog, is the wrapper: this
    // screen's `dot` has to move to wherever `onCursor` says, through this screen's own camera.
    const desk = chessMap();
    const stub = (): Painter => ({ ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} });
    let now = 0;
    let frame: ((ms: number) => void) | null = null;
    const clock = { now: () => now, frame: (cb: (ms: number) => void) => { frame = cb; return () => { frame = null; }; } };
    const tick = (n: number): void => { for (let i = 0; i < n && frame; i += 1) { now += 16; const cb = frame; frame = null; cb(now); } };
    const far = buildScene(desk, { animate: true, motion: { clock }, camera: { limits: { minZoom: 0.5, maxZoom: 2.5 }, content: chessRoom(), unit: CHESS_UNIT } }, currentSettings(), stub);
    document.body.appendChild(far.el);
    const dot = document.createElement("div");
    const screen: Screen = { seat: "black", ink: "alert", dot, scene: far };
    const pawn = squareAt(desk, { x: 0.5, y: 2.5 })!.children[0]!;
    // The near hand reports: this man, at this anchor.
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], { x: 0.5, y: 0.5 }, false, 1.3, {});
    expect(dot.style.display, "and the other hand is shown").toBe("block");
    tick(60);
    // The near hand lets go: the far screen lets go too, and its cursor is gone.
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], undefined, true, 1.3, {});
    expect(dot.style.display).toBe("none");
    far.dispose();
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
