import { describe, expect, it } from "vitest";
import { gameOfCommand, gameOfNewArg } from "./commands.js";

describe("gameOfCommand", () => {
  it("reads the game from a plain command", () => {
    expect(gameOfCommand("/cards")).toBe("cards");
    expect(gameOfCommand("/chess")).toBe("chess");
    expect(gameOfCommand("/nardy")).toBe("nardy");
  });

  it("strips the @botname suffix Telegram appends in groups", () => {
    expect(gameOfCommand("/cards@my_bot")).toBe("cards");
  });

  it("returns undefined for anything else", () => {
    expect(gameOfCommand("/start")).toBeUndefined();
    expect(gameOfCommand("/new")).toBeUndefined();
  });
});

describe("gameOfNewArg", () => {
  it("reads the game named after /new", () => {
    expect(gameOfNewArg("cards")).toBe("cards");
    expect(gameOfNewArg("  Chess  ")).toBe("chess");
  });

  it("returns undefined for a bare or unknown argument", () => {
    expect(gameOfNewArg(undefined)).toBeUndefined();
    expect(gameOfNewArg("")).toBeUndefined();
    expect(gameOfNewArg("poker")).toBeUndefined();
  });
});
