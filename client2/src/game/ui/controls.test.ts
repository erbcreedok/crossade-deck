import { describe, it, expect } from "vitest";
import { groupParams, type Param } from "./controls";

const num = (id: string): Param => ({ kind: "number", id, label: id, min: 0, max: 10, get: () => 0, set: () => {} });
const bool = (id: string): Param => ({ kind: "bool", id, label: id, get: () => false, set: () => {} });
const choice = (id: string): Param => ({ kind: "choice", id, label: id, options: ["a", "b"], get: () => 0, set: () => {} });

describe("groupParams", () => {
  it("раскладывает по kind в три группы, порядок внутри группы сохранён", () => {
    const params = [num("cols"), bool("reorder"), choice("onOccupied"), num("rows")];
    const g = groupParams(params);
    expect(g.numbers.map((p) => p.label)).toEqual(["cols", "rows"]);
    expect(g.bools.map((p) => p.label)).toEqual(["reorder"]);
    expect(g.choices.map((p) => p.label)).toEqual(["onOccupied"]);
  });

  it("пустой список параметров — три пустые группы", () => {
    const g = groupParams([]);
    expect(g).toEqual({ numbers: [], bools: [], choices: [] });
  });

  it("группа без совпадений остаётся пустой (не роняет остальные)", () => {
    const g = groupParams([choice("mode")]);
    expect(g.numbers).toEqual([]);
    expect(g.bools).toEqual([]);
    expect(g.choices).toHaveLength(1);
  });
});
