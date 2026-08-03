import { describe, it, expect } from "vitest";
import { begin, toggle, has, clear, active, ordered, EMPTY, type Selection } from "./selection";

// Изолированное выделение, ЗАМКНУТОЕ на контейнер (scope). Нельзя тогглить фигуру чужого
// контейнера — «при старте выделения нельзя выделять фигуры вне неё». Порядок выноса — компаратор
// (дефолт = порядок выделения; напр. сорт по номиналу). Чистые функции над данными.
describe("selection — режим и изоляция", () => {
  it("begin входит в режим для контейнера; EMPTY — не активен", () => {
    expect(active(EMPTY)).toBe(false);
    const s = begin("zoneA");
    expect(active(s)).toBe(true);
    expect(s.scope).toBe("zoneA");
    expect(s.ids).toEqual([]);
  });

  it("toggle добавляет/убирает фигуру СВОЕГО контейнера", () => {
    let s = begin("zoneA");
    s = toggle(s, "c1", "zoneA");
    expect(has(s, "c1")).toBe(true);
    s = toggle(s, "c1", "zoneA"); // повторно — снять
    expect(has(s, "c1")).toBe(false);
  });

  it("ИЗОЛЯЦИЯ: фигуру ЧУЖОГО контейнера тоггл игнорит", () => {
    let s = begin("zoneA");
    s = toggle(s, "x1", "zoneB"); // из другого контейнера — нельзя
    expect(has(s, "x1")).toBe(false);
    expect(s.ids).toEqual([]);
  });

  it("toggle вне режима (scope=null) — no-op", () => {
    expect(toggle(EMPTY, "c1", "zoneA")).toEqual(EMPTY);
  });

  it("clear выходит из режима", () => {
    const s = clear();
    expect(active(s)).toBe(false);
    expect(s.ids).toEqual([]);
  });
});

describe("selection — порядок выноса", () => {
  const sel: Selection = { scope: "z", ids: ["10", "6", "8"] };
  it("дефолт — порядок ВЫДЕЛЕНИЯ (как тыкал)", () => {
    expect(ordered(sel)).toEqual(["10", "6", "8"]);
  });
  it("компаратор — напр. сорт по номиналу (мультиселект по дефолту сортирует)", () => {
    expect(ordered(sel, (a, b) => Number(a) - Number(b))).toEqual(["6", "8", "10"]);
  });
});
