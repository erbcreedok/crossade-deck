import { describe, expect, it } from "vitest";
import { assembleTable } from "./tableAssemble";

describe("assembleTable", () => {
  it("разводит четыре бокса по (box, within)", () => {
    const slots = assembleTable(["A♠", "K♥"], ["Q♦"], ["J♣"], []);
    expect(slots).toEqual([
      { id: "A♠", box: "deck", within: 0 },
      { id: "K♥", box: "deck", within: 1 },
      { id: "Q♦", box: "hand", within: 0 },
      { id: "J♣", box: "discard", within: 0 },
    ]);
  });

  it("зона разворачивается в кучки play:N, within — снизу вверх", () => {
    const slots = assembleTable([], [], [], [
      ["6♠", "7♠"],
      ["10♦"],
    ]);
    expect(slots).toEqual([
      { id: "6♠", box: "play:0", within: 0 },
      { id: "7♠", box: "play:0", within: 1 },
      { id: "10♦", box: "play:1", within: 0 },
    ]);
  });

  it("каждая карта попадает в список ровно один раз", () => {
    const slots = assembleTable(["A♠"], ["K♥"], ["Q♦"], [["J♣"]]);
    expect(slots.map((s) => s.id).sort()).toEqual(["A♠", "J♣", "K♥", "Q♦"]);
  });

  it("пустой стол — пустой список", () => {
    expect(assembleTable([], [], [], [])).toEqual([]);
  });
});
