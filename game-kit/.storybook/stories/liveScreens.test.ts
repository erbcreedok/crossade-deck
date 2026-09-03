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
    const stub = (): Painter => ({ ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} });
    // With a camera, as every live pane has one: the cursor is a picture on the GLASS and needs the
    // view to know where the far hand is on it.
    const far = buildScene(desk, { animate: true, camera: { limits: { minZoom: 0.5, maxZoom: 2.5 }, content: chessRoom(), unit: CHESS_UNIT } }, currentSettings(), stub);
    document.body.appendChild(far.el);
    const dot = document.createElement("div");
    const screen: Screen = { seat: "black", ink: "alert", dot, scene: far };
    const pawn = squareAt(desk, { x: 0.5, y: 2.5 })!.children[0]!;
    const rest = far.motions!.poses()?.get(pawn.id);
    expect(rest, "nothing is carried yet, so nothing is overridden").toBeUndefined();
    // The near hand reports: this man, at this anchor.
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], { x: 0.5, y: 0.5 }, false, 1.3, {});
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], { x: 0.5, y: -0.5 }, false, 1.3, {});
    const carried = far.motions!.poses()?.get(pawn.id);
    expect(carried, "the far screen is now drawing him off his square").toBeDefined();
    expect(dot.style.display, "and the other hand is shown").toBe("block");
    // The near hand lets go: the far screen lets go too, and its cursor is gone.
    follow(screen, [{ id: pawn.id, offset: { x: 0, y: 0 } }], undefined, true, 1.3, {});
    expect(screen.mirroring, "nothing mirrored any more").toBeUndefined();
    expect(dot.style.display).toBe("none");
    far.dispose();
  });
});
