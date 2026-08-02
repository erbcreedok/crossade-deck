import { describe, it, expect } from "vitest";
import { heap, linear, resolveLayout, STACK_LAYOUTS, STACK_LAYOUT_IDS } from "./stackLayout";

// Раскладка стопки — ФУНКЦИЯ, а не имя из списка: направление, шаг и доворот это параметры одной
// линейной раскладки. Проверяем именно это свойство — что новых имён для новых направлений не
// требуется, — и детерминированность кучи, без которой игроки видели бы разные столы.

const CELL = { w: 100, h: 140 };

describe("linear — одна раскладка на все направления", () => {
  it("угол задаёт сторону: 0 — вправо, 180 — влево, 90 — вниз, 270 — вверх", () => {
    const at = (angleDeg: number) => linear({ angleDeg, step: 0.5 })(1, 5, CELL);
    expect(at(0).dx).toBeGreaterThan(0);
    expect(at(0).dy).toBeCloseTo(0, 6);
    expect(at(180).dx).toBeLessThan(0);
    expect(at(90).dy).toBeGreaterThan(0);
    expect(at(270).dy).toBeLessThan(0);
  });

  it("шаг меряется по ТОЙ стороне карты, вдоль которой идём", () => {
    // Иначе одна и та же «половина карты» давала бы разный нахлёст по горизонтали и вертикали.
    expect(linear({ angleDeg: 0, step: 0.5 })(1, 5, CELL).dx).toBeCloseTo(CELL.w * 0.5, 6);
    expect(linear({ angleDeg: 90, step: 0.5 })(1, 5, CELL).dy).toBeCloseTo(CELL.h * 0.5, 6);
  });

  it("смещение линейно по номеру карты, первая всегда в нуле", () => {
    const l = linear({ step: 0.4 });
    expect(l(0, 5, CELL)).toEqual({ dx: 0, dy: 0, rot: 0 });
    expect(l(3, 5, CELL).dx).toBeCloseTo(l(1, 5, CELL).dx * 3, 6);
  });

  it("доворот — тоже параметр, а не отдельная раскладка", () => {
    expect(linear({ rot: 0.1 })(2, 5, CELL).rot).toBeCloseTo(0.2, 6);
    expect(linear({})(2, 5, CELL).rot).toBe(0);
  });
});

describe("heap — вразнобой, но ОДИНАКОВО у всех", () => {
  it("разброс детерминирован: та же карта — то же место", () => {
    const a = heap()(3, 7, CELL);
    const b = heap()(3, 7, CELL);
    expect(a).toEqual(b);
  });

  it("соседние карты лежат по-разному — иначе это не куча, а стопка", () => {
    const h = heap();
    expect(h(1, 7, CELL)).not.toEqual(h(2, 7, CELL));
  });

  it("разброс держится в пределах заданного, а не улетает за стол", () => {
    const h = heap({ spread: 0.2 });
    for (let i = 0; i < 20; i++) {
      expect(Math.abs(h(i, 20, CELL).dx)).toBeLessThanOrEqual(CELL.w * 0.2);
      expect(Math.abs(h(i, 20, CELL).dy)).toBeLessThanOrEqual(CELL.h * 0.2);
    }
  });
});

describe("реестр готовых — удобство, а не единственная дверь", () => {
  it("СВОЯ раскладка работает без всякой регистрации", () => {
    const mine = resolveLayout((i) => ({ dx: i * 7, dy: i * 3, rot: 0 }));
    expect(mine(2, 5, CELL)).toEqual({ dx: 14, dy: 6, rot: 0 });
  });

  it("имя из реестра резолвится в функцию, неизвестное — в колоду, а не в падение", () => {
    expect(typeof resolveLayout("column")).toBe("function");
    expect(resolveLayout("нет такой")(1, 5, CELL)).toEqual(resolveLayout("tight")(1, 5, CELL));
  });

  it("у каждой готовой есть подпись — иначе в select попадёт голый ключ", () => {
    for (const id of STACK_LAYOUT_IDS) {
      expect(STACK_LAYOUTS[id]!.label.length, id).toBeGreaterThan(5);
    }
  });
});
