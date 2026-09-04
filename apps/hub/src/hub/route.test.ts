// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { goTo, placeOf, routeOf } from "./route.js";

describe("route and place parsing", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/");
  });

  it("parses simple game route", () => {
    location.hash = "#klondike";
    expect(routeOf()).toBe("klondike");
    expect(placeOf()).toEqual({ game: "klondike", room: undefined });
  });

  it("parses game and room", () => {
    location.hash = "#durak?room=AB12";
    expect(routeOf()).toBe("durak");
    expect(placeOf()).toEqual({ game: "durak", room: "AB12" });
  });

  it("ignores room if game is missing", () => {
    location.hash = "#?room=AB12";
    expect(routeOf()).toBeUndefined();
    expect(placeOf()).toEqual({ game: undefined, room: undefined });
  });

  it("handles empty hash", () => {
    location.hash = "";
    expect(routeOf()).toBeUndefined();
    expect(placeOf()).toEqual({ game: undefined, room: undefined });
  });

  it("goTo updates location hash with or without room", () => {
    goTo("durak", "push", "AB12");
    expect(location.hash).toBe("#durak?room=AB12");
    expect(placeOf()).toEqual({ game: "durak", room: "AB12" });

    goTo("klondike", "replace");
    expect(location.hash).toBe("#klondike");
    expect(placeOf()).toEqual({ game: "klondike", room: undefined });

    goTo(undefined, "replace");
    expect(location.hash).toBe("");
    expect(placeOf()).toEqual({ game: undefined, room: undefined });
  });
});
