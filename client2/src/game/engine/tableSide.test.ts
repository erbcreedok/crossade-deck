import { describe, expect, it } from "vitest";
import { boxFaceUp, flipForMove } from "./tableSide";

describe("boxFaceUp", () => {
  it("рука и зона — лицом, колода/сброс/чужое место — рубашкой", () => {
    expect(boxFaceUp("hand")).toBe(true);
    expect(boxFaceUp("play:0")).toBe(true);
    expect(boxFaceUp("play:7")).toBe(true);
    expect(boxFaceUp("deck")).toBe(false);
    expect(boxFaceUp("discard")).toBe(false);
    expect(boxFaceUp("seat-abc")).toBe(false);
  });
});

describe("flipForMove", () => {
  it("раздача колода→рука: рубашка→лицо (переворот)", () => {
    expect(flipForMove("deck", "hand")).toEqual({ flip: true, fromFaceUp: false, toFaceUp: true });
  });

  it("дроп в сброс рука→discard: лицо→рубашка (переворот)", () => {
    expect(flipForMove("hand", "discard")).toEqual({ flip: true, fromFaceUp: true, toFaceUp: false });
  });

  it("выкладка в зону рука→play: лицо→лицо (без переворота)", () => {
    expect(flipForMove("hand", "play:0")).toEqual({ flip: false, fromFaceUp: true, toFaceUp: true });
  });

  it("взять из сброса discard→рука: рубашка→лицо (переворот)", () => {
    expect(flipForMove("discard", "hand")).toEqual({ flip: true, fromFaceUp: false, toFaceUp: true });
  });

  it("зона→зона (реордер) и колода→сброс: без переворота", () => {
    expect(flipForMove("play:0", "play:1").flip).toBe(false);
    expect(flipForMove("deck", "discard").flip).toBe(false);
  });
});
