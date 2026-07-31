import type { Param } from "../../game/ui/controls";

// Мост между УЖЕ существующей моделью настраиваемых параметров компонента (Configurable.params(),
// ui/controls.ts) и контролами Storybook. Второй модели «что можно крутить» не заводим: песочница
// строит из params() канвасные Stepper/Toggle/Segmented, сторибук строит из них же панель — значит
// разъехаться им негде. Файл ЧИСТЫЙ (Pixi не импортируется), поэтому тестируется в node.

/** Минимум формы argTypes, который нам нужен; полный тип Storybook сюда тянуть незачем. */
export interface ArgTypeEntry {
  name: string;
  control:
    | { type: "range"; min: number; max: number; step: number }
    | { type: "boolean" }
    | { type: "select" }
    // "text" из Param не приходит (там только number/bool/choice) — он нужен компонентам вроде
    // Card, у которых опции задаются не через Configurable, а объектом конструктора.
    | { type: "text" };
  options?: string[];
}

const RU: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/**
 * Ключ аргумента из метки параметра. Метки у нас русские, а ключ уезжает в URL стори и в имена
 * контролов — поэтому транслитерируем. `index` подмешивается только при столкновении: у двух
 * параметров может быть одинаковая подпись (например «шаг» у разных осей), и без этого они бы
 * схлопнулись в один контрол, молча перезаписывая друг друга.
 */
export function argKey(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .split("")
    .map((c) => RU[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `param_${index}`;
}

function keysFor(params: Param[]): string[] {
  const seen = new Map<string, number>();
  return params.map((p, i) => {
    const base = argKey(p.label, i);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}_${i}`;
  });
}

export function paramsToArgTypes(params: Param[]): Record<string, ArgTypeEntry> {
  const keys = keysFor(params);
  const out: Record<string, ArgTypeEntry> = {};
  params.forEach((p, i) => {
    // Русская метка идёт в name: ключ — технический (URL, код), подпись в панели — человеческая.
    if (p.kind === "number") {
      // Канвасный аналог — Stepper с целым шагом (см. open-tasks §A.1: плавного слайдера в
      // канвасе нет). Держим тот же шаг, чтобы панель не предлагала значений, которых стенд
      // выставить не может.
      out[keys[i]] = { name: p.label, control: { type: "range", min: p.min, max: p.max, step: 1 } };
    } else if (p.kind === "bool") {
      out[keys[i]] = { name: p.label, control: { type: "boolean" } };
    } else {
      out[keys[i]] = { name: p.label, control: { type: "select" }, options: [...p.options] };
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
