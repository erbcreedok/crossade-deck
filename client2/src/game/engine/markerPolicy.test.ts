import { describe, it, expect } from "vitest";
import { shouldShow, type MarkerState } from "./markerPolicy";

// Политика видимости меток — ядро, чистое и generic (только счётчики контейнера).
describe("shouldShow", () => {
  const s = (atHome: number, total: number): MarkerState => ({ atHome, total });

  it("always — всегда", () => {
    expect(shouldShow("always", s(3, 3))).toBe(true);
    expect(shouldShow("always", s(0, 0))).toBe(true);
  });

  it("atHome — пока хоть что-то дома (дефолт драггера)", () => {
    expect(shouldShow("atHome", s(3, 5))).toBe(true);
    expect(shouldShow("atHome", s(0, 5))).toBe(false); // всё унесли
    expect(shouldShow("atHome", s(0, 0))).toBe(false); // пусто
  });

  it("away — унесли (дома пусто, но элементы живы)", () => {
    expect(shouldShow("away", s(0, 5))).toBe(true); // вся пачка в драге
    expect(shouldShow("away", s(3, 5))).toBe(false); // часть дома
    expect(shouldShow("away", s(0, 0))).toBe(false); // пусто — это не «унесли»
  });

  it("empty — все уничтожены", () => {
    expect(shouldShow("empty", s(0, 0))).toBe(true);
    expect(shouldShow("empty", s(0, 2))).toBe(false);
  });

  it("gone — ничего нет дома (унесли ИЛИ пусто)", () => {
    expect(shouldShow("gone", s(0, 5))).toBe(true); // унесли
    expect(shouldShow("gone", s(0, 0))).toBe(true); // пусто
    expect(shouldShow("gone", s(1, 5))).toBe(false); // что-то дома
  });
});
