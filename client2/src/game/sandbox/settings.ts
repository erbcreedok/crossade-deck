// НАСТРОЙКИ ПЕСОЧНИЦЫ — данные, которые крутит контекстное меню (long-press/ПКМ): форма борды,
// рассадка стола, слоты, стакинг, посадки, размер колоды. МОДУЛЬ ПЕСОЧНИЦЫ: generic-борда
// (game/boards) об этих настройках не знает — она получает готовые строки меню через шов
// BoardSceneOptions.menus (см. menus.ts). Чистые функции без Pixi.

export interface SandboxSettings {
  /** Форма борды-бокса (и круга стола при динамике). */
  shape: "circle" | "rect";
  /** Рассадка карт стола: по радиусу или сеткой. */
  table: "radial" | "grid";
  /** Слоты стола: динамичные или фиксированное число. */
  slots: "dynamic" | number;
  /** Для фикс-слотов: можно ли класть карты друг на друга. */
  stacking: boolean;
  /** Посадочные места вокруг стола. По умолчанию ОДИНОЧНЫЙ режим — никаких фантомных игроков. */
  seats: number;
  /** Размер колоды песочницы. Джокеры — позже (лицам карт нужен свой рендер). */
  deck: 36 | 52;
}

export const DEFAULT_SANDBOX_SETTINGS: SandboxSettings = {
  shape: "circle",
  table: "radial",
  slots: "dynamic",
  stacking: true,
  seats: 1,
  deck: 36,
};

/** Строка меню — данные: подпись слева, текущее значение справа; тап циклит значение. */
export interface SettingRow {
  key: keyof SandboxSettings;
  label: string;
  value: string;
}

const SLOT_STEPS: readonly (SandboxSettings["slots"])[] = ["dynamic", 4, 6, 8, 12];
const SEAT_STEPS: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 12];

function next<T>(steps: readonly T[], cur: T): T {
  const i = steps.indexOf(cur);
  return steps[(i + 1) % steps.length]!;
}

export function settingRows(target: "board" | "table", s: SandboxSettings): SettingRow[] {
  if (target === "board") {
    return [
      { key: "shape", label: "форма", value: s.shape === "circle" ? "круг" : "квадрат" },
      { key: "seats", label: "посадки", value: String(s.seats) },
    ];
  }
  const rows: SettingRow[] = [
    { key: "table", label: "рассадка", value: s.table === "radial" ? "по радиусу" : "сеткой" },
    { key: "slots", label: "слоты", value: s.slots === "dynamic" ? "динамично" : String(s.slots) },
  ];
  // Стакинг имеет смысл только на фикс-слотах: в динамике жители встраиваются, не стопкуются.
  if (s.slots !== "dynamic") rows.push({ key: "stacking", label: "стопки", value: s.stacking ? "можно" : "нельзя" });
  return rows;
}

/** Тап по строке меню: перещёлкнуть ОДНУ настройку на следующее значение. */
export function applySetting(s: SandboxSettings, key: keyof SandboxSettings): SandboxSettings {
  switch (key) {
    case "shape":
      return { ...s, shape: s.shape === "circle" ? "rect" : "circle" };
    case "table":
      return { ...s, table: s.table === "radial" ? "grid" : "radial" };
    case "slots":
      return { ...s, slots: next(SLOT_STEPS, s.slots) };
    case "stacking":
      return { ...s, stacking: !s.stacking };
    case "seats":
      return { ...s, seats: next(SEAT_STEPS, s.seats) };
    case "deck":
      return { ...s, deck: s.deck === 36 ? 52 : 36 };
  }
}
