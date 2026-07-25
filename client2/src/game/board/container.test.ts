import { describe, it, expect } from "vitest";
import { canAccept, add, insert, remove, runFrom, topId, size, has, type Container } from "./container";

// Логический атом: упорядоченный список членов (id) снизу→вверх, верх = последний. Чистые функции
// (иммутабельно возвращают новый контейнер) — сериализуется под server-sync, тестируется без Pixi.
const c = (members: string[], extra: Partial<Container> = {}): Container => ({ members, ...extra });

describe("container.canAccept", () => {
  it("пустой без ограничений принимает", () => {
    expect(canAccept(c([]), "x")).toBe(true);
  });
  it("locked не принимает", () => {
    expect(canAccept(c([], { locked: true }), "x")).toBe(false);
  });
  it("maxSize: полный отказывает, неполный принимает", () => {
    expect(canAccept(c(["a", "b"], { maxSize: 2 }), "x")).toBe(false);
    expect(canAccept(c(["a"], { maxSize: 2 }), "x")).toBe(true);
  });
  it("accepts-предикат фильтрует по id", () => {
    const only = c([], { accepts: (id) => id.startsWith("card") });
    expect(canAccept(only, "chip1")).toBe(false);
    expect(canAccept(only, "card1")).toBe(true);
  });
});

describe("container ops (иммутабельные)", () => {
  it("add кладёт ПОВЕРХ (в конец), исходный не мутирует", () => {
    const src = c(["a"]);
    const out = add(src, ["b", "c"]);
    expect(out.members).toEqual(["a", "b", "c"]);
    expect(src.members).toEqual(["a"]); // иммутабельность
  });
  it("insert вставляет на позицию j", () => {
    expect(insert(c(["a", "b", "c"]), ["x"], 1).members).toEqual(["a", "x", "b", "c"]);
  });
  it("remove убирает по id, порядок сохранён; отсутствующий — без изменений", () => {
    expect(remove(c(["a", "b", "c"]), ["b"]).members).toEqual(["a", "c"]);
    expect(remove(c(["a", "b"]), ["zzz"]).members).toEqual(["a", "b"]);
  });
  it("runFrom — хвост i..верх", () => {
    expect(runFrom(c(["a", "b", "c", "d"]), 1)).toEqual(["b", "c", "d"]);
    expect(runFrom(c(["a", "b"]), 0)).toEqual(["a", "b"]);
  });
  it("topId / size / has", () => {
    expect(topId(c(["a", "b"]))).toBe("b");
    expect(topId(c([]))).toBeUndefined();
    expect(size(c(["a", "b", "c"]))).toBe(3);
    expect(has(c(["a", "b"]), "b")).toBe(true);
    expect(has(c(["a"]), "z")).toBe(false);
  });
});
