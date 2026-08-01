import { describe, it, expect } from "vitest";
import { APPEAR_SPECS, APPEAR_SPEC_IDS, APPEAR_STYLES, APPEAR_STYLE_IDS, appearStyle, defaults, type StyleKnob } from "./appearStyles";
import { DESTROY_STYLES, DESTROY_STYLE_IDS, destroyStyle } from "./destroyStyles";
import { FLIP_SPECS, FLIP_SPEC_IDS, FLIP_STYLES, FLIP_STYLE_IDS, flipStyle } from "./flipStyles";

// РЕЕСТРЫ СТИЛЕЙ — общий контракт всех четырёх видов анимации (появление, уничтожение, переворот,
// перемещение; последний в moveStyles.test.ts). Правила, которые тут держатся:
//
//   • стиль передаётся ОБЪЕКТОМ, регистрация не нужна. Реестр — список готовых и точка для
//     сериализуемых конфигов, а не единственная дверь;
//   • неизвестное имя не роняет стол, а даёт умолчание: опечатка в конфиге игры не должна гасить
//     анимацию совсем;
//   • внутренние числа стиля (`knobs`) — ДАННЫЕ: каталог строит по ним панель сам, поэтому у
//     каждого рычага обязаны быть подпись, границы, шаг и дефолт внутри границ.

const knobsOk = (id: string, knobs: Record<string, StyleKnob>) => {
  for (const [name, k] of Object.entries(knobs)) {
    expect(k.label.length, `${id}.${name}: пустая подпись`).toBeGreaterThan(3);
    expect(k.max, `${id}.${name}: max ≤ min`).toBeGreaterThan(k.min);
    expect(k.step, `${id}.${name}: неположительный шаг`).toBeGreaterThan(0);
    expect(k.def, `${id}.${name}: дефолт ниже min`).toBeGreaterThanOrEqual(k.min);
    expect(k.def, `${id}.${name}: дефолт выше max`).toBeLessThanOrEqual(k.max);
  }
};

describe("появление", () => {
  it("свой стиль — объектом, без регистрации", () => {
    const mine = { label: "мой", dur: 0.3, frame: () => ({ alpha: 1, scale: 1, dx: 0, dy: 0, rot: 0, mask: null, shadow: 1 }) };
    expect(appearStyle(mine)).toBe(mine);
  });

  it("неизвестное имя даёт умолчание, а не падение", () => {
    expect(() => appearStyle("нет такого")).not.toThrow();
    expect(appearStyle("нет такого").dur).toBeGreaterThanOrEqual(0);
  });

  it("список имён включает и готовые, и стили с рычагами", () => {
    for (const id of [...Object.keys(APPEAR_STYLES), ...APPEAR_SPEC_IDS]) {
      expect(APPEAR_STYLE_IDS, id).toContain(id);
    }
  });

  it("рычаги стиля — корректные данные: подпись, границы, шаг, дефолт внутри границ", () => {
    for (const id of APPEAR_SPEC_IDS) knobsOk(id, APPEAR_SPECS[id]!.knobs);
  });

  it("стиль с рычагами собирается на своих же дефолтах", () => {
    for (const id of APPEAR_SPEC_IDS) {
      const spec = APPEAR_SPECS[id]!;
      const built = spec.make(defaults(spec.knobs));
      expect(built.label.length, id).toBeGreaterThan(3);
      expect(built.dur, id).toBeGreaterThan(0);
    }
  });
});

describe("уничтожение", () => {
  it("свой стиль — объектом; неизвестное имя даёт умолчание", () => {
    const mine = { label: "мой", dur: 0.4, frame: () => ({ alpha: 0, scale: 1, dx: 0, dy: 0, rot: 0, mask: null, shadow: null }) };
    expect(destroyStyle(mine)).toBe(mine);
    expect(() => destroyStyle("нет такого")).not.toThrow();
  });

  it("у каждого готового есть подпись и положительная длительность", () => {
    for (const id of DESTROY_STYLE_IDS) {
      expect(DESTROY_STYLES[id]!.label.length, id).toBeGreaterThan(3);
      expect(DESTROY_STYLES[id]!.dur, id).toBeGreaterThan(0);
    }
  });
});

describe("переворот", () => {
  it("свой стиль — объектом; неизвестное имя даёт умолчание", () => {
    expect(() => flipStyle("нет такого")).not.toThrow();
    for (const id of FLIP_STYLE_IDS) expect(flipStyle(id)).toBe(FLIP_STYLES[id]);
  });

  it("рычаги стиля — корректные данные", () => {
    for (const id of FLIP_SPEC_IDS) knobsOk(id, FLIP_SPECS[id]!.knobs);
  });

  // У переворота своей длительности нет намеренно: время ему задаёт пресет (`flip.dur`), потому
  // что расписание пачки и одиночный флип обязаны идти в одном темпе.
  it("стиль с рычагами собирается на своих же дефолтах", () => {
    for (const id of FLIP_SPEC_IDS) {
      const spec = FLIP_SPECS[id]!;
      const built = spec.make(defaults(spec.knobs));
      expect(built.label.length, id).toBeGreaterThan(3);
      expect(typeof built.frame, id).toBe("function");
      // Кадр на концах: карта пришла к своему углу, а не застряла между сторонами.
      expect(Number.isFinite(built.frame(0, 1).angle), id).toBe(true);
      expect(Number.isFinite(built.frame(1, 1).angle), id).toBe(true);
    }
  });
});
