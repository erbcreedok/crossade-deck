import { describe, expect, it } from "vitest";
import { blockDropOffset, inside, type Rect } from "./freeBox";

// Правила колоды-блока в боксе: бросить можно только в бокс; мимо — возврат к подъёму; внутри —
// стопку держим ЦЕЛИКОМ в боксе (чтобы тень не вылезала за контент).

const box: Rect = { x: 100, y: 100, w: 600, h: 900 }; // бокс 600×900 в (100,100)
const base = { x: 400, y: 550 }; // дом нижней карты (центр бокса)
const half = { w: 60, h: 90 }; // полу-габарит стопки

describe("blockDropOffset — дроп колоды-блока", () => {
  it("дроп ВНУТРИ бокса: сдвиг += путь пальца (стопка едет туда, где отпустил)", () => {
    // подняли в центре (400,550), отпустили в (300,700) — обе точки внутри бокса
    const off = blockDropOffset(box, { x: 0, y: 0 }, { x: 400, y: 550 }, { x: 300, y: 700 }, base, half);
    expect(off).toEqual({ x: -100, y: 150 });
  });

  it("дроп МИМО бокса: сдвиг НЕ меняется — стопка вернётся туда, откуда её подняли", () => {
    const cur = { x: 40, y: -20 };
    const off = blockDropOffset(box, cur, { x: 400, y: 550 }, { x: 1200, y: 1500 }, base, half);
    expect(off).toEqual(cur); // без изменений → release вернёт к подъёму
  });

  it("дроп у КРАЯ: стопка держится целиком в боксе (клампится по полу-габариту)", () => {
    // тянем в правый-нижний угол бокса — центр карты не должен выйти за (box+box - half)
    const off = blockDropOffset(box, { x: 0, y: 0 }, { x: 400, y: 550 }, { x: 699, y: 999 }, base, half);
    // макс. сдвиг X = (box.x+box.w-half.w) - base.x = (700-60) - 400 = 240
    // макс. сдвиг Y = (box.y+box.h-half.h) - base.y = (1000-90) - 550 = 360
    expect(off.x).toBe(240);
    expect(off.y).toBe(360);
    // проверяем инвариант: правый-нижний угол стопки внутри бокса
    expect(base.x + off.x + half.w).toBeLessThanOrEqual(box.x + box.w);
    expect(base.y + off.y + half.h).toBeLessThanOrEqual(box.y + box.h);
  });

  it("дроп у левого-верхнего угла: клампится по нижней границе (стопка не вылезает влево/вверх)", () => {
    const off = blockDropOffset(box, { x: 0, y: 0 }, { x: 400, y: 550 }, { x: 101, y: 101 }, base, half);
    // мин. сдвиг X = (box.x+half.w) - base.x = 160 - 400 = -240; Y = 190 - 550 = -360
    expect(off.x).toBe(-240);
    expect(off.y).toBe(-360);
    expect(base.x + off.x - half.w).toBeGreaterThanOrEqual(box.x);
    expect(base.y + off.y - half.h).toBeGreaterThanOrEqual(box.y);
  });

  it("inside: точка в боксе / вне бокса", () => {
    expect(inside(box, { x: 400, y: 550 })).toBe(true);
    expect(inside(box, { x: 50, y: 550 })).toBe(false);
    expect(inside(box, { x: 400, y: 1500 })).toBe(false);
  });
});
