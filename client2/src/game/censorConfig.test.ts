import { describe, it, expect } from "vitest";
import { DANCE_DEFAULT, DUST_FLICKER, DUST_TIME_SCALE, colorDustPoints, dustParams, dustPoints } from "./censorConfig";

describe("censorConfig — дефолты цензуры", () => {
  it("выбранный дефолт TG-пыли: частица 5 / свапы 25 / дрожание 1 / частота 1", () => {
    expect(DANCE_DEFAULT).toEqual({ block: 5, swapsPerSec: 25, jitterAmp: 1, jitterFreq: 1 });
  });

  it("мерцание по умолчанию выключено", () => {
    expect(DUST_FLICKER).toBe(false);
  });

  it("пыль замедлена в 3 раза (дефолт = как на 0.3x)", () => {
    expect(DUST_TIME_SCALE).toBeCloseTo(1 / 3);
  });
});

describe("dustParams — рычаги → параметры частиц", () => {
  it("прокидывает мерцание и зашитый множитель времени", () => {
    const p = dustParams(DANCE_DEFAULT, false);
    expect(p.flicker).toBe(false);
    expect(p.timeScale).toBeCloseTo(DUST_TIME_SCALE);
  });

  it("размер точки не меньше 1.5 даже при мелкой частице", () => {
    expect(dustParams({ block: 1, swapsPerSec: 0, jitterAmp: 0, jitterFreq: 0 }, false).dot).toBe(1.5);
    expect(dustParams({ block: 5, swapsPerSec: 0, jitterAmp: 0, jitterFreq: 0 }, false).dot).toBeCloseTo(4);
  });

  it("больше свапов → короче жизнь (живее churn), но не короче 0.35с", () => {
    const slow = dustParams({ block: 5, swapsPerSec: 0, jitterAmp: 1, jitterFreq: 1 }, false).life;
    const fast = dustParams({ block: 5, swapsPerSec: 120, jitterAmp: 1, jitterFreq: 1 }, false).life;
    expect(fast).toBeLessThan(slow);
    expect(fast).toBeGreaterThanOrEqual(0.35);
  });
});

describe("dustPoints — раскладка облака из сетки силуэта", () => {
  it("perCell точек на каждую включённую клетку", () => {
    const on = [true, false, false, true]; // 2×2, две клетки включены
    const pts = dustPoints(on, 2, 2, 4, 3, 0, 0);
    expect(pts).toHaveLength(2 * 3);
  });

  it("облако центрировано в (cx,cy): точки симметричны относительно центра", () => {
    const on = [true, true, true, true]; // 2×2 всё включено
    const pts = dustPoints(on, 2, 2, 4, 1, 0, 0);
    const sx = pts.reduce((a, p) => a + p.x, 0);
    const sy = pts.reduce((a, p) => a + p.y, 0);
    expect(sx).toBeCloseTo(0);
    expect(sy).toBeCloseTo(0);
  });

  it("сдвиг центра переносит всё облако на (cx,cy)", () => {
    const on = [true, true, true, true];
    const at0 = dustPoints(on, 2, 2, 4, 1, 0, 0);
    const at100 = dustPoints(on, 2, 2, 4, 1, 100, 50);
    at0.forEach((p, i) => {
      expect(at100[i]!.x).toBeCloseTo(p.x + 100);
      expect(at100[i]!.y).toBeCloseTo(p.y + 50);
    });
  });
});

// ——— цветные точки: пыль как СМАЗ лица, а не универсальная жёлтая крошка ———
//
// Прежний путь (dustPoints) знал один силуэт и красил всё амбером — цензура выглядела одинаково
// поверх туза пик и поверх джокера. Здесь клетка несёт свой цвет, и эти тесты держат ровно это
// обещание: цвет доезжает до точки, прозрачные клетки точек не дают, раскладка совпадает с
// булевым путём.
describe("colorDustPoints", () => {
  const cell = (on: boolean, color = 0) => ({ on, color });

  it("цвет клетки доезжает до точки — иначе смысла в цветном пути нет", () => {
    const pts = colorDustPoints([cell(true, 0xff0000)], 1, 1, 10, 1, 0, 0);
    expect(pts).toEqual([{ x: 0, y: 0, color: 0xff0000 }]);
  });

  it("прозрачные клетки точек не дают — иначе пыль лезла бы за скруглённую кромку карты", () => {
    const cells = [cell(false), cell(true, 0x112233), cell(false), cell(false)];
    const pts = colorDustPoints(cells, 2, 2, 10, 1, 0, 0);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.color).toBe(0x112233);
  });

  it("perCell размножает точку в той же клетке, сохраняя цвет", () => {
    const pts = colorDustPoints([cell(true, 0x00ff00)], 1, 1, 8, 3, 0, 0);
    expect(pts).toHaveLength(3);
    expect(new Set(pts.map((p) => `${p.x},${p.y},${p.color}`)).size).toBe(1);
  });

  it("облако центрируется в (cx,cy) — как и булевый путь, иначе пыль уехала бы с карты", () => {
    const cells = [cell(true), cell(true), cell(true), cell(true)];
    const color = colorDustPoints(cells, 2, 2, 10, 1, 100, 50);
    const bool = dustPoints([true, true, true, true], 2, 2, 10, 1, 100, 50);
    expect(color.map((p) => ({ x: p.x, y: p.y }))).toEqual(bool);
  });

  it("сетка без содержимого даёт пустое облако, а не одну точку в нуле", () => {
    expect(colorDustPoints([cell(false), cell(false)], 2, 1, 10, 1, 0, 0)).toEqual([]);
  });

  it("короткая сетка не роняет обход: недостающие клетки просто пропускаются", () => {
    expect(colorDustPoints([cell(true, 1)], 2, 2, 10, 1, 0, 0)).toHaveLength(1);
  });
});
