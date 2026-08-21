import { describe, expect, it } from "vitest";
import { type Atom } from "../atom.js";
import { node } from "../node.js";
import { Transformable } from "./transformable.js";
import { Tiltable, tiltAngle, tiltStops, nextTilt, setTilt, stopOf } from "./tiltable.js";

const token = (...extra: Atom[]) => node("t", Transformable({ at: { x: 0, y: 0 } }), ...extra);

describe("Tiltable", () => {
  it("tilt.default-two-stops — upright and tapped-sideways out of the box", () => {
    expect(tiltStops(token(Tiltable({})))).toEqual([0, 90]);
  });

  it("tilt.angle-at-a-stop — the index picks the degree", () => {
    expect(tiltAngle(token(Tiltable({ stops: [0, 120, 240] })), 1)).toBe(120);
  });

  it("tilt.out-of-range-clamps — a tap never points a node nowhere", () => {
    const t = token(Tiltable({ stops: [0, 120, 240] }));
    expect(tiltAngle(t, 9)).toBe(240);
    expect(tiltAngle(t, -3)).toBe(0);
  });

  it("tilt.tap-advances-to-the-next-stop", () => {
    expect(nextTilt(token(Tiltable({ stops: [0, 90] })), 0)).toBe(1);
  });

  it("tilt.tap-wraps-past-the-last — untap by tapping again", () => {
    expect(nextTilt(token(Tiltable({ stops: [0, 90], wrap: true })), 1)).toBe(0);
  });

  it("tilt.tap-rests-on-last-without-wrap", () => {
    expect(nextTilt(token(Tiltable({ stops: [0, 90, 180], wrap: false })), 2)).toBe(2);
  });

  it("tilt.single-stop-never-moves", () => {
    expect(nextTilt(token(Tiltable({ stops: [0] })), 0)).toBe(0);
  });

  it("tilt.no-tiltable-no-angle-and-index-frozen", () => {
    const bare = token();
    expect(tiltAngle(bare, 0)).toBeUndefined();
    expect(tiltStops(bare)).toEqual([]);
    expect(nextTilt(bare, 4)).toBe(4);
  });

  it("tilt.the-stop-lives-on-the-node — a tilt survives being written down", () => {
    // The whole point of the field: before it, which stop a piece stood on lived in a runtime and
    // nowhere else — so a tilt did not survive a reload, and a piece turned by one player stood
    // upright for everybody else. `Flippable.turns` and a die's face were already kept this way;
    // `Tiltable` was the outlier.
    const card = node("c", Transformable({}), Tiltable({ stops: [0, 90, 180], stop: 1 }));
    expect(stopOf(card)).toBe(1);
    expect(tiltAngle(card)).toBe(90); // asked without an index: the node's own
  });

  it("tilt.a-node-with-no-tiltable-stands-on-nothing", () => {
    expect(stopOf(node("c", Transformable({})))).toBe(0);
  });

  it("tilt.the-writer-clamps-like-the-reader — a tap can never point it nowhere", () => {
    const card = node("c", Transformable({}), Tiltable({ stops: [0, 90, 180] }));
    setTilt(card, 9);
    expect(stopOf(card)).toBe(2);
    setTilt(card, -4);
    expect(stopOf(card)).toBe(0);
  });

  it("tilt.the-tap-reads-the-node-and-the-writer-answers-it", () => {
    // Together they are the whole gesture: where it stands, where a tap takes it, and writing it.
    const card = node("c", Transformable({}), Tiltable({ stops: [0, 90], wrap: true }));
    setTilt(card, nextTilt(card));
    expect(stopOf(card)).toBe(1);
    setTilt(card, nextTilt(card));
    expect(stopOf(card)).toBe(0); // wrapped
  });

  it("tilt.a-node-without-the-atom-is-left-alone-by-the-writer", () => {
    const bare = node("c", Transformable({}));
    setTilt(bare, 2);
    expect(stopOf(bare)).toBe(0);
  });
});