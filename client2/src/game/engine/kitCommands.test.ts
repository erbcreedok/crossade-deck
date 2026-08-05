import { describe, expect, it } from "vitest";
import { applyCommand, type CommandDeps } from "./kitCommands";
import type { SceneElement } from "./sceneEngine";
import type { AnimPreset } from "../anim/presets";

// ГВАРД ПОРТА КОМАНД витрины. Главное правило здесь одно, и его уже ломали: команда `move` переносит
// ДОМ вместе с предметом. Пока дом оставался прежним, дроп в слот доски отыгрывался назад — зона
// честно раскладывала фигуру командой move, а следом release() тянул её на СТАРЫЙ дом, и со стороны
// это читалось как «дроп не работает».

const PRESET = { move: { style: "spring" }, speed: 1 } as unknown as AnimPreset;

/** Подставной элемент: пишет в журнал всё, что с ним сделали. `can` — какие способности он знает. */
function element(can: { flip?: boolean; conceal?: boolean; value?: boolean } = {}) {
  const log = { travels: [] as { x: number; y: number; style: unknown; speed: number }[], flips: 0, concealed: null as boolean | null, value: null as string | null };
  const el: Record<string, unknown> = {
    id: "c0",
    body: { travelTo: (p: { x: number; y: number }, style: unknown, speed: number) => log.travels.push({ ...p, style, speed }) },
  };
  if (can.flip !== undefined) {
    el.requestFlip = () => {
      log.flips++;
      return can.flip!;
    };
  }
  if (can.conceal) el.setConcealed = (v: boolean) => void (log.concealed = v);
  if (can.value) el.setValue = (v: string) => void (log.value = v);
  return { el: el as unknown as SceneElement, log };
}

/** Двери сцены: журнал переездов дома и пробуждений. */
function doors(el: SceneElement | undefined, homeDepth: number | null = 7) {
  const log = { homes: [] as { x: number; y: number; depth: number }[], wakes: 0 };
  const deps: CommandDeps = {
    element: () => el,
    homeOf: () => (homeDepth === null ? null : { home: { x: 0, y: 0 }, depth: homeDepth }),
    setHome: (_el, home, depth) => log.homes.push({ ...home, depth }),
    preset: () => PRESET,
    wake: () => void log.wakes++,
  };
  return { deps, log };
}

describe("applyCommand", () => {
  it("нет адресата — ничего не делаем и не будим цикл", () => {
    const d = doors(undefined);
    expect(applyCommand({ t: "flip", id: "нет" }, d.deps)).toBe(false);
    expect(d.log.wakes).toBe(0);
  });

  it("move переносит ДОМ вместе с предметом, сохраняя его глубину", () => {
    const e = element();
    const d = doors(e.el);
    applyCommand({ t: "move", id: "c0", x: 120, y: 40 }, d.deps);
    expect(d.log.homes).toEqual([{ x: 120, y: 40, depth: 7 }]);
  });

  it("move летит СТИЛЕМ пресета, а не прямой подменой цели", () => {
    const e = element();
    applyCommand({ t: "move", id: "c0", x: 5, y: 6 }, doors(e.el).deps);
    expect(e.log.travels).toEqual([{ x: 5, y: 6, style: "spring", speed: 1 }]);
  });

  it("у элемента СВОЙ фил важнее общего, а скорость остаётся общей", () => {
    const e = element();
    (e.el as unknown as { animPreset: AnimPreset }).animPreset = { move: { style: "arc" }, speed: 9 } as unknown as AnimPreset;
    applyCommand({ t: "move", id: "c0", x: 1, y: 2 }, doors(e.el).deps);
    expect(e.log.travels[0]!.style).toBe("arc");
    expect(e.log.travels[0]!.speed).toBe(1);
  });

  it("без записи в реестре move всё равно летит — просто дому некуда переезжать", () => {
    const e = element();
    const d = doors(e.el, null);
    applyCommand({ t: "move", id: "c0", x: 3, y: 4 }, d.deps);
    expect(d.log.homes).toEqual([]);
    expect(e.log.travels).toHaveLength(1);
  });

  it("отказ переворота останавливает команду — будить нечего", () => {
    const e = element({ flip: false });
    const d = doors(e.el);
    expect(applyCommand({ t: "flip", id: "c0" }, d.deps)).toBe(false);
    expect(e.log.flips).toBe(1);
    expect(d.log.wakes).toBe(0);
  });

  it("успешный переворот будит цикл", () => {
    const e = element({ flip: true });
    const d = doors(e.el);
    expect(applyCommand({ t: "flip", id: "c0" }, d.deps)).toBe(true);
    expect(d.log.wakes).toBe(1);
  });

  it("conceal и setValue доходят до элемента, который их умеет", () => {
    const e = element({ conceal: true, value: true });
    applyCommand({ t: "conceal", id: "c0", v: true }, doors(e.el).deps);
    applyCommand({ t: "setValue", id: "c0", value: "K♠" }, doors(e.el).deps);
    expect(e.log.concealed).toBe(true);
    expect(e.log.value).toBe("K♠");
  });

  it("элемент без способности команду молча пропускает (фишка не знает про номинал)", () => {
    const e = element();
    expect(applyCommand({ t: "setValue", id: "c0", value: "K♠" }, doors(e.el).deps)).toBe(true);
    expect(e.log.value).toBeNull();
  });
});
