import { fanAssembly, FAN_MAX_SPREAD, FAN_RADIUS_MULT, FAN_STEP, type FanOpts } from "../slotfield/fanAssembly";

// РАСКЛАДКА СТОПКИ — ФУНКЦИЯ, а не имя из списка.
//
// Было: `form: "tight" | "spread" | "fan"`. Три имени, и чтобы разложить колоду вниз, влево или под
// углом, пришлось бы регистрировать по имени на каждое направление — пять сторон, пять записей, и
// шестая на «то же, но шаг поменьше». Направление и шаг это ПАРАМЕТРЫ, а не разные сущности.
//
// Поэтому раскладка здесь — функция «где i-я карта относительно первой». Направления задаются
// углом, а не именами; готовые ниже — просто вызовы этой функции с разными числами, и своя пишется
// так же, без всякой регистрации:
//
//   stackState(ctx, at, { layout: (i) => ({ dx: i * 12, dy: Math.sin(i) * 30, rot: i * 0.1 }) })

export interface StackOffset {
  /** Смещение от первой карты, px контента. */
  dx: number;
  dy: number;
  /** Наклон, рад. */
  rot: number;
}

/** i — номер карты, n — сколько всего, cell — размер карты. `strength` (≥1, по умолчанию 1) — усиление
 *  раскладки для СПРЕДА: раскладка растит свой натуральный параметр (linear — step, fan — дугу, heap —
 *  разброс) в strength раз, оставаясь по центру/направлению. strength=1 — покой (rest). Чистая. */
export type StackLayout = (i: number, n: number, cell: { w: number; h: number }, strength?: number) => StackOffset;

/**
 * ЛИНЕЙНАЯ раскладка в ЛЮБУЮ сторону. Ею выражаются и колода, и раскрытая стопка, и столбец
 * Косынки, и ряд — разницу задают угол и шаг, а не отдельные имена.
 *
 * `step` — доля ширины (для горизонтальных) или высоты (для вертикальных) карты; знак учитывается
 * углом, поэтому «влево» это angle 180, а не отрицательный шаг.
 */
export function linear(opts: { angleDeg?: number; step?: number; rot?: number } = {}): StackLayout {
  const a = ((opts.angleDeg ?? 0) * Math.PI) / 180;
  const step = opts.step ?? 0.55;
  const rot = opts.rot ?? 0;
  return (i, _n, cell, strength = 1) => {
    // Шаг меряем по той стороне карты, вдоль которой идём: у вертикального столбца «половина
    // карты» это половина ВЫСОТЫ, и мерить её шириной значило бы получать разный нахлёст у
    // одной и той же цифры. Спред растит ШАГ (step×strength) вдоль того же угла — направление даром.
    const len = Math.abs(Math.cos(a)) * cell.w + Math.abs(Math.sin(a)) * cell.h;
    const s = step * strength;
    return { dx: Math.cos(a) * s * len * i, dy: Math.sin(a) * s * len * i, rot: rot * i };
  };
}

/** Веер: дуга с наклоном каждой карты. Геометрия — board/fanAssembly.ts, второй тут не заводим.
 *  Спред растит дугу СИММЕТРИЧНО (веер строится от центральной карты): step×strength (шире угол),
 *  maxSpread×strength (снимаем кап, иначе рост упрётся) и radiusMult×strength (глубже). Центр на месте. */
export function fan(opts: FanOpts = {}): StackLayout {
  return (i, n, cell, strength = 1) => {
    const grown: FanOpts =
      strength === 1
        ? opts
        : {
            ...opts,
            step: (opts.step ?? FAN_STEP) * strength,
            maxSpread: (opts.maxSpread ?? FAN_MAX_SPREAD) * strength,
            radiusMult: (opts.radiusMult ?? FAN_RADIUS_MULT) * strength,
          };
    const offs = fanAssembly(Array.from({ length: n }, (_, k) => String(k)), cell.w, grown);
    const cur = offs[i];
    // Веер строится от ЦЕНТРАЛЬНОЙ карты, а раскладка меряется от первой — сдвигаем на её offset,
    // иначе стопка уезжала бы влево тем сильнее, чем она длиннее.
    const first = offs[0];
    return cur && first ? { dx: cur.dx - first.dx, dy: cur.dy - first.dy, rot: cur.rot } : { dx: 0, dy: 0, rot: 0 };
  };
}

/**
 * КУЧА: карты внахлёст под случайными углами — так лежит сброс, а не аккуратная стопка.
 * Разброс ДЕТЕРМИНИРОВАННЫЙ (от индекса), иначе куча пересобиралась бы на каждый кадр и на каждом
 * клиенте выглядела по-своему — в мультиплеере это значит, что игроки видят разные столы.
 */
export function heap(opts: { spread?: number; tilt?: number } = {}): StackLayout {
  const spread = opts.spread ?? 0.22;
  const tilt = opts.tilt ?? 0.5;
  return (i, _n, cell, strength = 1) => {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.6789;
    const frac = (v: number) => v - Math.floor(v);
    // Спред растит РАЗБРОС (spread×strength) — куча раздаётся радиально, узор детерминирован.
    const s = spread * strength;
    return { dx: (frac(a) - 0.5) * cell.w * s * 2, dy: (frac(b) - 0.5) * cell.h * s * 2, rot: (frac(a + b) - 0.5) * tilt };
  };
}

/**
 * Готовые раскладки ПО ИМЕНИ. Нужны только двум вещам: панели каталога (в select нельзя положить
 * функцию) и сериализуемым конфигам доски (функцию по сети не пошлёшь). Всё остальное передаёт
 * функцию напрямую.
 */
export const STACK_LAYOUTS: Readonly<Record<string, { label: string; make: () => StackLayout }>> = {
  tight: { label: "колода — карты почти совмещены, видна верхняя и толщина пачки", make: () => linear({ step: 0.06 }) },
  spread: { label: "раскрытая вправо — виден каждый ранг", make: () => linear({ step: 0.72 }) },
  left: { label: "раскрытая влево", make: () => linear({ angleDeg: 180, step: 0.72 }) },
  column: { label: "столбец вниз — тот самый tableau Косынки", make: () => linear({ angleDeg: 90, step: 0.28 }) },
  up: { label: "столбец вверх", make: () => linear({ angleDeg: 270, step: 0.28 }) },
  diagonal: { label: "по диагонали", make: () => linear({ angleDeg: 35, step: 0.5 }) },
  row: { label: "ряд без нахлёста — карты стоят раздельно", make: () => linear({ step: 1.12 }) },
  cascade: { label: "лесенка с доворотом каждой карты", make: () => linear({ angleDeg: 20, step: 0.45, rot: 0.06 }) },
  fan: { label: "веер — дуга с наклоном", make: fan },
  heap: { label: "куча — сброс, а не стопка: внахлёст и вразнобой", make: () => heap() },
};

export const STACK_LAYOUT_IDS: string[] = Object.keys(STACK_LAYOUTS);

/** Чем задана раскладка: САМОЙ функцией или именем готовой. */
export type StackLayoutRef = StackLayout | string;

export function resolveLayout(v: StackLayoutRef): StackLayout {
  if (typeof v !== "string") return v;
  return (STACK_LAYOUTS[v] ?? STACK_LAYOUTS.tight!).make();
}
