// THE GLASS A FAR HAND IS DRAWN ON — how big it is, how big it stays, and where a cursor lands on it.
//
// Three questions and two bugs, both of which showed as one picture: a desk the size of a coin with
// somebody's dot beside it rather than on the card. The region the desk lives in lost its own
// `position` to a guard reading the inline style, so it collapsed to a strip and every pixel was
// measured against a glass a quarter of the phone tall; and the idle glide brought the view home to
// the room's fit, undoing the opening six seconds after nobody had touched it.

import { describe, expect, it } from "vitest";
import { Camera, idleReturn, type Presence, type Transform } from "game-kit";
import { dotAt, homeAt, needsPositioning } from "./index.js";

describe("the container a cursor is pinned inside", () => {
  it("hub.stage-keeps-its-own-position — a region already positioned is left alone", () => {
    // `#stage` is `position:absolute` with `top`/`bottom` in the page's stylesheet. Told it needs a
    // `relative` of its own, the inline rule wins and the region collapses to the canvas's 2:1.
    expect(needsPositioning("absolute")).toBe(false);
    expect(needsPositioning("relative")).toBe(false);
    expect(needsPositioning("fixed")).toBe(false);
    expect(needsPositioning("sticky")).toBe(false);
  });

  it("hub.static-container-still-gets-a-home — a dot needs something to be absolute against", () => {
    expect(needsPositioning("static")).toBe(true);
  });
});

describe("where a far hand's cursor lands", () => {
  // A camera looking at the desk's origin on a 393×744 glass, 40 pixels to the unit.
  const view: Transform = { a: 40, b: 0, c: 0, d: 40, e: 196.5, f: 372 };

  it("hub.cursor-is-my-camera — the anchor is desk units, the pixels are this screen's", () => {
    expect(dotAt({ x: 0, y: 0 }, view)).toEqual({ left: 196.5, top: 372 });
    expect(dotAt({ x: 2, y: -3 }, view)).toEqual({ left: 276.5, top: 252 });
  });

  it("hub.cursor-turns-with-the-view — a rolled camera carries the dot round with it", () => {
    // The same desk seen by the seat opposite: turned 180°, the point lands on the other side.
    const turned: Transform = { a: -40, b: 0, c: 0, d: -40, e: 196.5, f: 372 };
    expect(dotAt({ x: 2, y: -3 }, turned)).toEqual({ left: 116.5, top: 492 });
  });

  it("hub.cursor-follows-the-zoom — the same anchor moves out as the glass zooms in", () => {
    const near = dotAt({ x: 3, y: 0 }, view);
    const far = dotAt({ x: 3, y: 0 }, { ...view, a: 20, d: 20 });
    expect(near.left - view.e).toBeCloseTo(2 * (far.left - view.e), 6);
  });
});

describe("where the idle glide comes home", () => {
  /** The round desk's own numbers: the room `roomFor("cards")` builds, on a 393×744 phone. */
  const ROOM = { x: -9.7, y: -9.7, w: 19.4, h: 19.4 };
  const UNIT = Math.max(1, Math.min(393 / ROOM.w, 744 / ROOM.h));
  /** What the desk opens on — the circle at `CARDS_OVERFILL` of the glass. */
  const OPENED = (393 * 1.5) / (12 * UNIT);

  const desk = (): Camera => {
    const camera = new Camera({ minZoom: 0.5, maxZoom: 2.5 });
    camera.setScreen(393, 744);
    camera.setContent(ROOM, UNIT);
    camera.setZoom(OPENED);
    return camera;
  };
  /** A seat at the top of the round desk, which is all the glide reads of a person. */
  const sitting = () => ({ place: { at: { x: 0, y: 0 }, facing: 0 } }) as unknown as Presence;

  const idleFor = (camera: Camera, ms: number): void => {
    const glide = idleReturn(camera, sitting, {});
    for (let spent = 0; spent < ms; spent += 100) glide.step(100);
  };

  it("hub.idle-comes-home-to-the-opening — a desk nobody touched keeps the size it opened at", () => {
    const camera = desk();
    idleFor(homeAt(camera, () => OPENED), 12000);
    expect(camera.zoom).toBeCloseTo(OPENED, 3);
  });

  it("hub.the-fit-is-not-home — left to `fitZoom` the same desk shrinks to the whole room", () => {
    // The guard's own proof: without the stand-in the glide undoes the opening by itself.
    const camera = desk();
    idleFor(camera, 12000);
    expect(camera.zoom).toBeCloseTo(camera.fitZoom(), 3);
    expect(camera.zoom).toBeLessThan(OPENED / 2);
  });

  it("hub.home-changes-nothing-else — the glide still moves the eye through the real camera", () => {
    const camera = desk();
    camera.lookAt({ x: 4, y: 0 });
    idleFor(homeAt(camera, () => OPENED), 12000);
    expect(camera.target.x).toBeCloseTo(0, 3);
  });
});
