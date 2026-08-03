import { describe, it, expect } from "vitest";
import { Stack, STACK_DEFAULTS, type StackConfig } from "./stack";
import { ANCHOR_ICON_IDS } from "../engine/markerPolicy";

// Конфигурация стопки — ОДНА точка входа (StackConfig + Stack.params()). Раньше её не было: часть
// настроек жила в аргументах конструктора, один рычаг в params(), а вид якоря вообще на стороне
// движка. Эти тесты и держат новое обещание: «всё, что у стопки настраивается, перечислено тут».
//
// Файл чистый (Pixi не импортируется) — то есть проверяемо в node, в отличие от самой отрисовки.

const CELL = { w: 100, h: 140 };
const make = (o: Partial<StackConfig> & { step?: number } = {}) =>
  new Stack({ left: 0, top: 0, cell: CELL, ids: ["a", "b", "c"], step: 40, ...o });

const param = (s: Stack, label: string) => s.params().find((p) => p.label === label)!;

describe("конфиг стопки", () => {
  it("дефолты применяются, когда конфиг не задан", () => {
    const s = make();
    expect(s.reorder).toBe(STACK_DEFAULTS.reorder);
    expect(s.anchor).toEqual(STACK_DEFAULTS.anchor);
  });

  it("конфиг конструктора переопределяет дефолты", () => {
    const s = make({ reorder: true, anchor: { icon: "pin", show: "always" } });
    expect(s.reorder).toBe(true);
    expect(s.anchor).toEqual({ icon: "pin", show: "always" });
  });

  it("рычагов ровно четыре, и это те, что заявлены", () => {
    expect(make().params().map((p) => p.label)).toEqual(["нахлёст, %", "реордер", "иконка якоря", "якорь виден"]);
  });

  it("шаг двигает дома карт: больше нахлёст — карты дальше друг от друга", () => {
    const s = make();
    const near = s.homeOf("c").x - s.homeOf("a").x;
    s.step = 80;
    const far = s.homeOf("c").x - s.homeOf("a").x;
    expect(far).toBeGreaterThan(near);
  });

  it("шаг задаётся в ПРОЦЕНТАХ ширины карты — на телефоне и десктопе рычаг значит одно и то же", () => {
    const s = make({ step: 40 }); // 40 из 100 → 40 %
    expect(param(s, "нахлёст, %").get()).toBe(40);
    (param(s, "нахлёст, %") as { set(v: number): void }).set(75);
    expect(s.step).toBeCloseTo(75);
  });

  it("рычаг «реордер» правит саму способность, а не копию флага", () => {
    const s = make({ reorder: false });
    (param(s, "реордер") as { set(v: boolean): void }).set(true);
    expect(s.reorder).toBe(true);
  });

  it("рычаг иконки перебирает ВЕСЬ словарь и ничего не выдумывает", () => {
    const s = make();
    const p = param(s, "иконка якоря") as { options: string[]; get(): number; set(i: number): void };
    expect(p.options).toEqual([...ANCHOR_ICON_IDS]);
    p.set(2);
    expect(s.anchor.icon).toBe(ANCHOR_ICON_IDS[2]);
    expect(p.get()).toBe(2);
  });

  it("рычаг видимости якоря round-trip'ится через индекс", () => {
    const s = make();
    const p = param(s, "якорь виден") as { options: string[]; get(): number; set(i: number): void };
    const i = p.options.indexOf("empty");
    p.set(i);
    expect(s.anchor.show).toBe("empty");
    expect(p.get()).toBe(i);
  });

  it("якорь описан ДАННЫМИ и потому сериализуем — иначе конфиг не отдать нативному клиенту", () => {
    const s = make({ anchor: { icon: "ring", show: "gone" } });
    expect(JSON.parse(JSON.stringify(s.anchor))).toEqual({ icon: "ring", show: "gone" });
  });

  it("конфиг конструктора не делится между стопками (копия, а не общая ссылка)", () => {
    const a = make();
    const b = make();
    a.anchor.icon = "pin";
    expect(b.anchor.icon).toBe(STACK_DEFAULTS.anchor.icon);
  });
});
