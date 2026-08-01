import type { Param } from "../../game/ui/controls";

// Мост между УЖЕ существующей моделью настраиваемых параметров компонента (Configurable.params(),
// ui/controls.ts) и контролами Storybook. Второй модели «что можно крутить» не заводим: песочница
// строит из params() канвасные Stepper/Toggle/Segmented, сторибук строит из них же панель — значит
// разъехаться им негде. Файл ЧИСТЫЙ (Pixi не импортируется), поэтому тестируется в node.

/** Минимум формы argTypes, который нам нужен; полный тип Storybook сюда тянуть незачем. */
export interface ArgTypeEntry {
  /** НАСТОЯЩЕЕ имя параметра — то, что написано в коде компонента. Английское. */
  name: string;
  /** Человеческое пояснение. Здесь и только здесь уместен русский текст. */
  description?: string;
  control:
    | { type: "range"; min: number; max: number; step: number }
    | { type: "boolean" }
    | { type: "select" }
    // "text" из Param не приходит (там только number/bool/choice) — он нужен компонентам вроде
    // Card, у которых опции задаются не через Configurable, а объектом конструктора.
    | { type: "text" };
  options?: string[];
}

/**
 * Ключ аргумента — это ИМЯ параметра, как оно объявлено компонентом. Никаких преобразований:
 * ключ уезжает в URL стори и в код теста, и он обязан совпадать с тем, что написано в params().
 *
 * Раньше ключ выводился из русской подписи транслитерацией — отсюда была и таблица кириллических
 * ключей в этом файле, и скрытая хрупкость: правка подписи молча меняла ключ стори.
 */
function keysFor(params: Param[]): string[] {
  return params.map((p) => p.id);
}

export function paramsToArgTypes(params: Param[]): Record<string, ArgTypeEntry> {
  const keys = keysFor(params);
  const out: Record<string, ArgTypeEntry> = {};
  params.forEach((p, i) => {
    // name — настоящее имя параметра, description — человеческое пояснение. Наоборот было бы
    // удобно читать и невозможно искать: в панели стояла бы подпись, которой нет в коде.
    const meta = { name: p.id, description: p.label };
    if (p.kind === "number") {
      // Канвасный аналог — Stepper с целым шагом (см. open-tasks §A.1: плавного слайдера в
      // канвасе нет). Держим тот же шаг, чтобы панель не предлагала значений, которых стенд
      // выставить не может.
      out[keys[i]] = { ...meta, control: { type: "range", min: p.min, max: p.max, step: 1 } };
    } else if (p.kind === "bool") {
      out[keys[i]] = { ...meta, control: { type: "boolean" } };
    } else {
      out[keys[i]] = { ...meta, control: { type: "select" }, options: [...p.options] };
    }
  });
  return out;
}

export function paramsToArgs(params: Param[]): Record<string, unknown> {
  const keys = keysFor(params);
  const out: Record<string, unknown> = {};
  params.forEach((p, i) => {
    // choice снаружи — МЕТКА варианта, внутри — индекс. Наружу отдаём читаемое.
    out[keys[i]] = p.kind === "choice" ? p.options[p.get()] : p.get();
  });
  return out;
}

/** Влить значения из панели в параметры. Возвращает, изменилось ли хоть что-то (нужно ли перерисовать). */
export function applyArgsToParams(params: Param[], args: Record<string, unknown>): boolean {
  const keys = keysFor(params);
  let changed = false;
  params.forEach((p, i) => {
    const v = args[keys[i]];
    if (v === undefined) return;
    if (p.kind === "choice") {
      const idx = p.options.indexOf(String(v));
      // Метки нет в списке — молча пропускаем: уронить параметр в -1 значит выбрать несуществующий
      // вариант и получить неопределённое поведение компонента.
      if (idx < 0 || idx === p.get()) return;
      p.set(idx);
      changed = true;
      return;
    }
    if (p.kind === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || n === p.get()) return;
      p.set(n);
      changed = true;
      return;
    }
    const b = Boolean(v);
    if (b === p.get()) return;
    p.set(b);
    changed = true;
  });
  return changed;
}
