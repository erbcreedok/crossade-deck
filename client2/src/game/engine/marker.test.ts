import { describe, it, expect } from "vitest";
import { showAlways, showAway, showEmpty, showGone } from "./marker";

// Предикаты видимости — ядро политики меток. Чистые, generic (только счётчики контейнера).
describe("marker showWhen", () => {
  const s = (atHome: number, total: number) => ({ atHome, total });

  it("always — всегда", () => {
    expect(showAlways(s(3, 3))).toBe(true);
    expect(showAlways(s(0, 0))).toBe(true);
  });

  it("away — унесли (дома пусто, но элементы живы)", () => {
    expect(showAway(s(0, 5))).toBe(true); // вся пачка в драге
    expect(showAway(s(3, 5))).toBe(false); // часть дома
    expect(showAway(s(0, 0))).toBe(false); // пусто — это не «унесли»
  });

  it("empty — все уничтожены", () => {
    expect(showEmpty(s(0, 0))).toBe(true);
    expect(showEmpty(s(0, 2))).toBe(false);
  });

  it("gone — ничего нет дома (унесли ИЛИ пусто)", () => {
    expect(showGone(s(0, 5))).toBe(true); // унесли
    expect(showGone(s(0, 0))).toBe(true); // пусто
    expect(showGone(s(1, 5))).toBe(false); // что-то дома
  });
});
