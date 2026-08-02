import { describe, it, expect } from "vitest";
import { BASE_PRESET, PRESETS, presetById, resolvePreset, scaled } from "./presets";
import { flipDuration, flipSchedule } from "./flipSchedule";
import { FLIP_STYLES, FLIP_STYLE_IDS, flipStyle } from "./flipStyles";
import { DESTROY_STYLES, DESTROY_STYLE_IDS, destroyStyle } from "./destroyStyles";
import { APPEAR_STYLE_IDS, appearStyle } from "./appearStyles";
import { TEX_H } from "../engine/constants";

describe("resolvePreset", () => {
  it("пустое перекрытие оставляет базу нетронутой", () => {
    expect(resolvePreset({})).toEqual(BASE_PRESET);
  });

  it("перекрывает только названное, соседи по тому же объекту сохраняются", () => {
    const p = resolvePreset({ flip: { dur: 0.2 } });
    expect(p.flip.dur).toBe(0.2);
    expect(p.flip.halfTurns).toBe(BASE_PRESET.flip.halfTurns); // ← иначе перекрытие стирало бы соседей
  });

  it("пружины сливаются поканально: правка pos не трогает rot и scale", () => {
    const p = resolvePreset({ springs: { pos: { stiffness: 999 } } });
    expect(p.springs.pos.stiffness).toBe(999);
    expect(p.springs.pos.damping).toBe(BASE_PRESET.springs.pos.damping);
    expect(p.springs.rot).toEqual(BASE_PRESET.springs.rot);
  });

  it("не мутирует базу — иначе один каталог отравил бы весь стол", () => {
    const before = JSON.stringify(BASE_PRESET);
    resolvePreset({ flip: { dur: 9 }, dust: { block: 9 } });
    expect(JSON.stringify(BASE_PRESET)).toBe(before);
  });
});

describe("presetById", () => {
  it("неизвестное имя не роняет, а даёт базу: опечатка в конфиге игры не должна гасить стол", () => {
    expect(presetById("нет-такого")).toEqual(BASE_PRESET);
  });

  it("перекрытие стопки ложится ПОВЕРХ именованного пресета", () => {
    const p = presetById("lazy", { flip: { dur: 0.1 } });
    expect(p.flip.dur).toBe(0.1); // своё
    expect(p.stackFlip.stagger).toBe(PRESETS.lazy!.over.stackFlip!.stagger); // от пресета
  });

  it("каждый именованный пресет разрешается в полный набор", () => {
    for (const id of Object.keys(PRESETS)) {
      const p = presetById(id);
      expect(p.flip.dur, id).toBeGreaterThan(0);
      expect(p.speed, id).toBeGreaterThan(0);
    }
  });
});

describe("flipSchedule", () => {
  const ids = ["a", "b", "c", "d"];

  it("whole — все стартуют одновременно", () => {
    const s = flipSchedule(ids, presetById("snappy"));
    expect(s.map((x) => x.delay)).toEqual([0, 0, 0, 0]);
  });

  it("cascade — волна слева направо с равным шагом", () => {
    const p = presetById("cascade");
    const s = flipSchedule(ids, p);
    expect(s[0]!.delay).toBe(0);
    expect(s[1]!.delay).toBeCloseTo(p.stackFlip.stagger);
    expect(s[3]!.delay).toBeCloseTo(p.stackFlip.stagger * 3);
  });

  it("reverse: true разворачивает порядок домов, false оставляет карты на месте", () => {
    expect(flipSchedule(ids, resolvePreset({ stackFlip: { reverse: true } })).map((x) => x.toIndex)).toEqual([3, 2, 1, 0]);
    expect(flipSchedule(ids, resolvePreset({ stackFlip: { reverse: false } })).map((x) => x.toIndex)).toEqual([0, 1, 2, 3]);
  });

  it("реверс — ПЕРЕСТАНОВКА: ни один дом не потерян и ни один не занят дважды", () => {
    const to = flipSchedule(ids, resolvePreset({ stackFlip: { reverse: true } })).map((x) => x.toIndex);
    expect([...to].sort()).toEqual([0, 1, 2, 3]);
  });

  it("speed сжимает ВОЛНУ, а не только флип: иначе быстрый пресет тянулся бы прежнее время", () => {
    const slow = flipSchedule(ids, resolvePreset({ stackFlip: { mode: "cascade", stagger: 0.1 }, speed: 1 }));
    const fast = flipSchedule(ids, resolvePreset({ stackFlip: { mode: "cascade", stagger: 0.1 }, speed: 2 }));
    expect(fast.at(-1)!.delay).toBeCloseTo(slow.at(-1)!.delay / 2);
  });

  it("пустая пачка — пустое расписание, без падений", () => {
    expect(flipSchedule([], BASE_PRESET)).toEqual([]);
    expect(flipDuration(0, BASE_PRESET)).toBe(0);
  });

  it("длительность пачки = последняя задержка плюс её собственный флип", () => {
    const p = resolvePreset({ stackFlip: { mode: "cascade", stagger: 0.1 }, flip: { dur: 0.4 }, speed: 1 });
    expect(flipDuration(3, p)).toBeCloseTo(0.2 + 0.4);
  });
});

describe("реестры стилей", () => {
  it("каждый стиль переворота даёт НУЛЕВОЕ отклонение на концах — иначе карта прилетит домой скачком", () => {
    for (const id of FLIP_STYLE_IDS) {
      const f = FLIP_STYLES[id]!.frame;
      for (const p of [0, 1]) {
        const fr = f(p, 1);
        expect(Math.abs(fr.dx), `${id} dx при p=${p}`).toBeLessThan(1e-9);
        expect(Math.abs(fr.dy), `${id} dy при p=${p}`).toBeLessThan(1e-9);
        expect(Math.abs(fr.rot), `${id} rot при p=${p}`).toBeLessThan(1e-9);
        expect(fr.scale, `${id} scale при p=${p}`).toBeCloseTo(1);
      }
    }
  });

  it("переворот доводится до конца: на p=1 карта показывает ДРУГУЮ сторону", () => {
    for (const id of FLIP_STYLE_IDS) {
      // Нечётное число полуоборотов = сторона сменилась. cos(angle) < 0 — противоположная.
      expect(Math.cos(FLIP_STYLES[id]!.frame(1, 1).angle), id).toBeLessThan(0);
    }
  });

  // Способов исчезнуть несколько, и «пустая маска» — только один из них. У горения маска к концу
  // НЕ пуста: её полигон целиком уезжает выше верхней кромки, и видно от карты всё равно ничего.
  // Проверять надо результат («не видно»), а не одну из его реализаций.
  const maskShowsNothing = (mask: number[][] | null): boolean =>
    mask !== null && mask.every((poly) => poly.filter((_, i) => i % 2 === 1).every((y) => y <= -TEX_H / 2 + 1));

  it("каждый способ уничтожения к концу убирает карту — чем угодно: маской, прозрачностью, уходом", () => {
    for (const id of DESTROY_STYLE_IDS) {
      const st = DESTROY_STYLES[id]!;
      const f = st.frame(st.dur, { age: 1, width: 100 });
      const gone = f.alpha < 0.05 || f.scale < 0.05 || Math.abs(f.dx) > 300 || maskShowsNothing(f.mask);
      expect(gone, `${id} к концу всё ещё виден`).toBe(true);
    }
  });

  it("на СТАРТЕ карта, наоборот, видна целиком — иначе уничтожение начиналось бы с мигания", () => {
    for (const id of DESTROY_STYLE_IDS) {
      const f = DESTROY_STYLES[id]!.frame(0, { age: 0, width: 100 });
      expect(f.alpha, `${id} стартует прозрачным`).toBeGreaterThan(0.9);
      expect(f.scale, `${id} стартует ужатым`).toBeGreaterThan(0.9);
      expect(maskShowsNothing(f.mask), `${id} стартует уже съеденным маской`).toBe(false);
    }
  });

  it("тень уходит раньше карты — иначе от неё осталось бы пятно на пустом столе", () => {
    for (const id of DESTROY_STYLE_IDS) {
      const st = DESTROY_STYLES[id]!;
      const f = st.frame(st.dur, { age: 1, width: 100 });
      expect(f.shadow === null || f.shadow < 0.35, `${id} держит тень до конца`).toBe(true);
    }
  });

  // У появления требование СТРОЖЕ, чем у уничтожения: оно заканчивается обычной картой в своём
  // доме. Не сойдётся — карта останется жить сдвинутой, полупрозрачной или обрезанной маской
  // НАВСЕГДА, и заметят это далеко не сразу.
  it("каждое появление заканчивается нейтральным кадром — карта в доме, целая и непрозрачная", () => {
    for (const id of APPEAR_STYLE_IDS) {
      // Реестр готовых теперь включает и стили-ФАБРИКИ (собранные с их умолчаниями), поэтому
      // берём через резолвер, а не индексом по таблице простых.
      const st = appearStyle(id);
      const f = st.frame(st.dur, { age: 1, width: 100 });
      expect(f.dx, `${id} dx`).toBeCloseTo(0);
      expect(f.dy, `${id} dy`).toBeCloseTo(0);
      expect(f.rot, `${id} rot`).toBeCloseTo(0);
      expect(f.scale, `${id} scale`).toBeCloseTo(1);
      expect(f.alpha, `${id} alpha`).toBeCloseTo(1);
      expect(f.mask, `${id} оставил маску — карта останется обрезанной`).toBeNull();
      expect(f.shadow, `${id} оставил карту без тени`).not.toBeNull();
    }
  });

  it("появление НАЧИНАЕТСЯ незаметно: либо карта ещё прозрачна, либо она не в доме", () => {
    for (const id of APPEAR_STYLE_IDS) {
      if (id === "none") continue; // «без анимации» — осознанное отсутствие эффекта
      const st = appearStyle(id);
      const f = st.frame(0, { age: 0, width: 100 });
      const hidden = f.alpha < 0.2 || f.scale < 0.2 || Math.abs(f.dx) > 50 || Math.abs(f.dy) > 50 || f.mask !== null;
      expect(hidden, `${id} стартует уже готовой картой — эффекта не будет видно`).toBe(true);
    }
  });

  it("неизвестный id не роняет: переворот падает в spin, уничтожение в burn", () => {
    expect(flipStyle("нет-такого")).toBe(FLIP_STYLES.spin);
    expect(destroyStyle("нет-такого")).toBe(DESTROY_STYLES.burn);
  });

  it("пресеты ссылаются только на СУЩЕСТВУЮЩИЕ стили", () => {
    for (const id of Object.keys(PRESETS)) {
      const p = presetById(id);
      expect(FLIP_STYLE_IDS, `${id}.flip.style`).toContain(p.flip.style);
      expect(DESTROY_STYLE_IDS, `${id}.destroy.style`).toContain(p.destroy.style);
      expect(APPEAR_STYLE_IDS, `${id}.appear.style`).toContain(p.appear.style);
    }
  });
});

describe("scaled", () => {
  it("делит на множитель скорости", () => {
    expect(scaled(1, 2)).toBe(0.5);
  });
  it("нулевая/отрицательная скорость не даёт бесконечность — возвращаем как есть", () => {
    expect(scaled(1, 0)).toBe(1);
  });
});
