import { describe, it, expect } from "vitest";
import { liftPixels, moveStyle, MOVE_STYLES, MOVE_STYLE_IDS, pointOnPath } from "./moveStyles";

// Стили перемещения. Проверяем два правила разом:
//   • подъём в полёте — ВЫСОТА, а не сдвиг позиции: место на столе идёт строго по прямой, иначе
//     тень летит по той же дуге и перспектива пропадает;
//   • стиль передаётся ОБЪЕКТОМ, реестр — удобство: своя анимация не требует регистрации.

const FROM = { x: 0, y: 0 };
const TO = { x: 300, y: 400 }; // длина пути ровно 500 — считать удобно

describe("кадры готовых стилей", () => {
  it("на концах пути элемент строго в старте и строго в цели", () => {
    for (const id of MOVE_STYLE_IDS) {
      const f = MOVE_STYLES[id]!.frame;
      if (!f) continue; // пружина: время задаёт физика, кадров у неё нет
      expect(f(0).along, `${id} в начале`).toBeCloseTo(0, 6);
      expect(f(1).along, `${id} в конце`).toBeCloseTo(1, 6);
    }
  });

  it("на концах пути элемент лежит на столе — высота нулевая", () => {
    for (const id of MOVE_STYLE_IDS) {
      const f = MOVE_STYLES[id]!.frame;
      if (!f) continue;
      expect(f(0).lift, `${id} в начале`).toBeCloseTo(0, 6);
      expect(f(1).lift, `${id} в конце`).toBeCloseTo(0, 6);
    }
  });

  it("«дуга» и «прыжок» действительно поднимаются над столом, «скольжение» — нет", () => {
    expect(MOVE_STYLES.arc!.frame!(0.5).lift).toBeGreaterThan(0);
    expect(MOVE_STYLES.hop!.frame!(0.3).lift).toBeGreaterThan(0);
    expect(MOVE_STYLES.slide!.frame!(0.5).lift).toBe(0);
  });

  it("выше над столом — крупнее: высота показывается размером, иначе её не видно", () => {
    const mid = MOVE_STYLES.arc!.frame!(0.5);
    expect(mid.scale).toBeGreaterThan(1);
    expect(MOVE_STYLES.slide!.frame!(0.5).scale).toBe(1);
  });

  it("у каждого готового есть подпись и неотрицательная длительность", () => {
    for (const id of MOVE_STYLE_IDS) {
      expect(MOVE_STYLES[id]!.label.length, id).toBeGreaterThan(5);
      expect(MOVE_STYLES[id]!.dur, id).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("подъём — ВЫСОТА, а не сдвиг позиции", () => {
  it("место на столе идёт строго по прямой, как бы высоко элемент ни поднялся", () => {
    const f = MOVE_STYLES.arc!.frame!(0.5);
    const p = pointOnPath(FROM, TO, f);
    // Точка обязана лежать на отрезке: доля по x и по y одна и та же.
    expect(p.x / (TO.x - FROM.x)).toBeCloseTo(p.y / (TO.y - FROM.y), 6);
    expect(p.x).toBeCloseTo((TO.x - FROM.x) * f.along, 6);
  });

  it("высота считается от ДЛИНЫ пути: дальше летит — выше поднимается", () => {
    const f = { along: 0.5, lift: 0.2, rot: 0, scale: 1 };
    expect(liftPixels(FROM, TO, f)).toBeCloseTo(500 * 0.2, 6);
    expect(liftPixels(FROM, { x: 30, y: 40 }, f)).toBeCloseTo(50 * 0.2, 6);
  });

  it("нулевой путь не даёт ни NaN, ни высоты", () => {
    const f = MOVE_STYLES.arc!.frame!(0.5);
    expect(liftPixels(FROM, FROM, f)).toBe(0);
    expect(pointOnPath(FROM, FROM, f)).toEqual({ x: 0, y: 0 });
  });
});

describe("реестр — удобство, а не единственная дверь", () => {
  it("СВОЙ стиль работает объектом, без всякой регистрации", () => {
    const mine = { label: "мой", dur: 0.2, frame: (p: number) => ({ along: p, lift: p, rot: 0, scale: 1 }) };
    expect(moveStyle(mine)).toBe(mine);
  });

  it("имя резолвится в готовый, неизвестное — в пружину, а не в падение", () => {
    expect(moveStyle("arc")).toBe(MOVE_STYLES.arc);
    expect(moveStyle("нет такого")).toBe(MOVE_STYLES.spring);
  });

  it("пружина объявлена ОТСУТСТВИЕМ кадров — движение отдаётся физике", () => {
    expect(MOVE_STYLES.spring!.frame).toBeNull();
  });
});
