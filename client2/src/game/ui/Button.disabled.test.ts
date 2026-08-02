// @vitest-environment jsdom
//
// Кнопка меряет свою подпись (`Text.width`), а измерение текста в Pixi идёт через canvas — в
// голом node его нет вовсе. jsdom даёт ровно то, чего не хватает; подставной реализации Pixi
// по-прежнему не нужно.
import { beforeAll, describe, it, expect } from "vitest";
import { Button } from "./Button";

// `disabled` ГАСИТ ВИД, а не только клик.
//
// Правило владельца: кнопка, неотличимая на глаз от рабочей, но молча не работающая, — худший из
// вариантов. Проверяется настоящим объектом (Pixi v8 в node живёт как есть), без подставной
// реализации: гашение — это alpha корня и цвет подписи, то есть обычные поля.

// jsdom отдаёт canvas без 2d-контекста, а Pixi меряет им подпись. Подставляем МИНИМУМ, которым
// он пользуется при измерении: шрифт и ширину строки. Это заглушка браузерного API, а не нашего
// движка — сам Button остаётся настоящим.
beforeAll(() => {
  const ctx = {
    font: "",
    measureText: (t: string) => ({ width: t.length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 8 }),
    fillText: () => {},
    clearRect: () => {},
    scale: () => {},
    setTransform: () => {},
    save: () => {},
    restore: () => {},
  };
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  // Pixi спрашивает у КЛАССА контекста, поддерживается ли letterSpacing; без node-canvas
  // jsdom этого класса не объявляет вовсе.
  (globalThis as unknown as { CanvasRenderingContext2D: unknown }).CanvasRenderingContext2D = class {
    letterSpacing = "";
  };
});

const btn = (o: Partial<ConstructorParameters<typeof Button>[0]> = {}) => new Button({ label: "сжечь", ...o });

describe("Button: disabled", () => {
  it("гасит ВИД: погашенная кнопка бледнее рабочей", () => {
    expect(btn({ disabled: true }).root.alpha).toBeLessThan(btn().root.alpha);
  });

  it("гасит и КЛИК: обработчик не зовётся", () => {
    let clicks = 0;
    const b = btn({ disabled: true, onClick: () => clicks++ });
    b.click();
    expect(clicks).toBe(0);
  });

  it("выпадает из хит-теста — палец проходит мимо, а не «нажимает вникуда»", () => {
    const b = btn({ disabled: true });
    b.place(100, 100);
    expect(b.hitTest(100, 100)).toBe(false);
    const live = btn();
    live.place(100, 100);
    expect(live.hitTest(100, 100)).toBe(true);
  });

  it("не отвечает ни на ховер, ни на нажатие: аффорданс не должен обещать действие", () => {
    const b = btn({ disabled: true });
    const a0 = b.root.alpha;
    b.hover(true);
    b.setPressed(true);
    b.step(0.5);
    b.sync();
    expect(b.root.alpha).toBe(a0);
    expect(b.root.scale.x).toBe(1); // нажатие не проиграно
  });

  it("переключение ПОСЛЕ монтирования перекрашивает сразу, а не к следующему кадру", () => {
    const b = btn();
    const bright = b.root.alpha;
    b.setDisabled(true);
    expect(b.root.alpha).toBeLessThan(bright);
    b.setDisabled(false);
    expect(b.root.alpha).toBe(bright);
  });
});
