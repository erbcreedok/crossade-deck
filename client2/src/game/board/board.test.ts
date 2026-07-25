import { describe, it, expect } from "vitest";
import { at, isEmpty, occupiedKeys, place, removeFrom, move, reorder, type Board } from "./board";

// Board = слоты (по ключу "r,c") → Container. Чистые иммутабельные переходы; onEmpty (collapse/keep)
// — структурный дефолт (кастом-refill вешается слоем выше через Action). Геометрия — отдельный layout.
const board = (slots: Board["slots"], onEmpty: Board["onEmpty"] = "collapse"): Board => ({ slots, onEmpty });

describe("board — доступ", () => {
  const b = board({ "0,0": { members: ["a", "b"] }, "0,1": { members: [] } });
  it("at / isEmpty / occupiedKeys", () => {
    expect(at(b, "0,0")?.members).toEqual(["a", "b"]);
    expect(isEmpty(b, "0,1")).toBe(true); // пустой контейнер
    expect(isEmpty(b, "9,9")).toBe(true); // нет слота
    expect(isEmpty(b, "0,0")).toBe(false);
    expect(occupiedKeys(b)).toEqual(["0,0"]); // только непустые
  });
});

describe("board — place / removeFrom + onEmpty", () => {
  it("place создаёт слот, исходный не мутирует", () => {
    const b = board({});
    const nb = place(b, "1,1", { members: ["x"] });
    expect(at(nb, "1,1")?.members).toEqual(["x"]);
    expect(at(b, "1,1")).toBeUndefined();
  });
  it("частичное removeFrom оставляет контейнер", () => {
    const b = board({ "0,0": { members: ["a", "b", "c"] } });
    expect(at(removeFrom(b, "0,0", ["b"]), "0,0")?.members).toEqual(["a", "c"]);
  });
  it("опустошение: collapse удаляет слот", () => {
    const b = board({ "0,0": { members: ["a"] } }, "collapse");
    const nb = removeFrom(b, "0,0", ["a"]);
    expect(at(nb, "0,0")).toBeUndefined();
    expect(occupiedKeys(nb)).toEqual([]);
  });
  it("опустошение: keep оставляет пустой контейнер", () => {
    const b = board({ "0,0": { members: ["a"] } }, "keep");
    const nb = removeFrom(b, "0,0", ["a"]);
    expect(at(nb, "0,0")?.members).toEqual([]);
    expect(isEmpty(nb, "0,0")).toBe(true);
  });
});

describe("board — move", () => {
  it("в занятый слот — merge поверх; источник reагирует по onEmpty", () => {
    const b = board({ "0,0": { members: ["a", "b"] }, "0,1": { members: ["x"] } }, "collapse");
    const nb = move(b, "0,0", "0,1", ["b"]);
    expect(at(nb, "0,1")?.members).toEqual(["x", "b"]); // поверх
    expect(at(nb, "0,0")?.members).toEqual(["a"]); // источник n-1
  });
  it("в пустой слот — создаётся контейнер; источник опустел → collapse", () => {
    const b = board({ "0,0": { members: ["a"] } }, "collapse");
    const nb = move(b, "0,0", "2,2", ["a"]);
    expect(at(nb, "2,2")?.members).toEqual(["a"]);
    expect(at(nb, "0,0")).toBeUndefined();
  });
  it("makeContainer задаёт политику нового слота (maxSize и т.п.)", () => {
    const b = board({ "0,0": { members: ["a"] } });
    const nb = move(b, "0,0", "2,2", ["a"], (ids) => ({ members: ids, maxSize: 1 }));
    expect(at(nb, "2,2")).toEqual({ members: ["a"], maxSize: 1 });
  });
});

describe("board — reorder (внутри слота, insert-at)", () => {
  it("перемещает членов на позицию j", () => {
    const b = board({ "0,0": { members: ["a", "b", "c"] } });
    expect(at(reorder(b, "0,0", ["c"], 0), "0,0")?.members).toEqual(["c", "a", "b"]);
  });
});
