import { describe, expect, it } from "vitest";
import { faceAfterDrop, freeStackSize, insideBox, looseOrigin, nextLooseKey } from "./freeDrop";

describe("freeDrop: свободный дроп в бокс", () => {
  it("футпринт стопки растёт со стаггером", () => {
    expect(freeStackSize({ w: 100, h: 143 }, 1)).toEqual({ w: 100, h: 143 });
    expect(freeStackSize({ w: 100, h: 143 }, 5)).toEqual({ w: 102, h: 145 });
    expect(freeStackSize({ w: 100, h: 143 }, 0)).toEqual({ w: 100, h: 143 });
  });

  it("insideBox: у круга считается вписанный круг, не квадрат", () => {
    const box = { x: 0, y: 0, w: 100, h: 100 };
    expect(insideBox(box, "circle", { x: 50, y: 50 })).toBe(true);
    expect(insideBox(box, "circle", { x: 50, y: 2 })).toBe(true); // у верха, по центру
    expect(insideBox(box, "circle", { x: 3, y: 3 })).toBe(false); // угол квадрата вне круга
    expect(insideBox(box, "rect", { x: 3, y: 3 })).toBe(true);
    expect(insideBox(box, undefined, { x: 101, y: 50 })).toBe(false);
  });

  it("nextLooseKey: минимальный свободный индекс ≥ 1, чужие зоны не мешают", () => {
    expect(nextLooseKey("board", ["board:0"])).toBe("board:1");
    expect(nextLooseKey("board", ["board:0", "board:1", "board:3", "table:2"])).toBe("board:2");
    expect(nextLooseKey("board", [])).toBe("board:1");
  });

  it("looseOrigin: стопка центрируется на точке дропа и не вылезает из бокса", () => {
    const box = { w: 760, h: 760 };
    const stack = { w: 100, h: 143 };
    expect(looseOrigin(box, { x: 380, y: 380 }, stack)).toEqual({ x: 330, y: 308.5 });
    expect(looseOrigin(box, { x: 0, y: 0 }, stack)).toEqual({ x: 0, y: 0 });
    expect(looseOrigin(box, { x: 760, y: 760 }, stack)).toEqual({ x: 660, y: 617 });
  });

  it("сторона после дропа: стол и колода-из-стола хранят сторону, колода из руки/центра — своё правило", () => {
    // На стол (свободная стопка) — той стороной, которой несли, откуда бы ни несли.
    expect(faceAfterDrop({ fromFree: false, toFree: true, toDeck: false, carried: true })).toBe(true);
    expect(faceAfterDrop({ fromFree: true, toFree: true, toDeck: false, carried: false })).toBe(false);
    // В колоду из руки/центра — сторону диктует колода (null).
    expect(faceAfterDrop({ fromFree: false, toFree: true, toDeck: true, carried: true })).toBeNull();
    // В колоду со стола — той стороной, которой лежала (одна перевёрнутая в колоде — ок).
    expect(faceAfterDrop({ fromFree: true, toFree: true, toDeck: true, carried: true })).toBe(true);
    // В центр/руку/посадку — правило зоны (null).
    expect(faceAfterDrop({ fromFree: true, toFree: false, toDeck: false, carried: false })).toBeNull();
  });
});
