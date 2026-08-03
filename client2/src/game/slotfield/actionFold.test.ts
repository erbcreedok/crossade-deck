import { describe, it, expect } from "vitest";
import { foldAction, type Fold } from "./actionFold";

// Свёртка Action над группой (GRID-DESIGN.md, раздел Actions). Пресеты all/each/container/block +
// своя reduce-функция. Чистая: по способности членов (can) решает, к кому применить / блок / контейнер.
const members = ["a", "b", "c"];
const canBurn = (id: string) => id !== "c"; // c — не Burnable

describe("foldAction", () => {
  it("all: все умеют → применить ко всем", () => {
    const r = foldAction(members, () => true, "all");
    expect(r).toEqual({ apply: ["a", "b", "c"], container: false, blocked: false });
  });
  it("all: кто-то не умеет → блок (no-op → домой)", () => {
    const r = foldAction(members, canBurn, "all");
    expect(r).toEqual({ apply: [], container: false, blocked: true });
  });
  it("each: применить только умеющим, остальных пропустить", () => {
    const r = foldAction(members, canBurn, "each");
    expect(r).toEqual({ apply: ["a", "b"], container: false, blocked: false });
  });
  it("container: контейнер сам выполняет (членам способность не нужна)", () => {
    const r = foldAction(members, () => false, "container");
    expect(r).toEqual({ apply: [], container: true, blocked: false });
  });
  it("block: запрет", () => {
    const r = foldAction(members, () => true, "block");
    expect(r).toEqual({ apply: [], container: false, blocked: true });
  });
  it("своя reduce-функция (escape-hatch)", () => {
    const topDown: Fold = (ms, can) => ({ apply: ms.filter(can).slice(0, 1), container: false, blocked: false });
    expect(foldAction(members, canBurn, topDown).apply).toEqual(["a"]);
  });
});
