import { comparatorFor, type CollectItem } from "./collectOrder";
import { rowAssembly } from "./rowAssembly";

// Сборка выделенного НАБОРА — рычаги как ДАННЫЕ (SELECTION-DESIGN §4–5, issue #56). Ось порядка
// РАЗДЕЛЕНА на два слоя: естественный `order` (proximity/selection/append) и принудительный
// `sortOverride` ПОВЕРХ него (none/rank/suit/…). Ранг тут — РАВНЫЙ override-критерий, НЕ отдельная
// привилегированная ось (прежний тумблер «сорт набора» был именно этой ошибкой). Ось геометрии
// `form` — отдельно и делегирует существующим атомам (row → rowAssembly, стопки — тонкий/раскрытый
// сдвиг). Новая стратегия/форма = запись в таблице, а не ветка у места вызова.

/** Когда собирать набор в форму. Потребляется движком (момент вызова), не геометрией. */
export type GatherOn = "drag-start" | "select-each" | "select-first" | "never";
/** Куда «якорь» набора. Потребляется движком (точка сборки), не геометрией. */
export type Anchor = "finger" | "first" | "latest" | "zone";
/** Форма набора — геометрия раскладки (делегирует атому). */
export type Form = "stack-tight" | "stack-open" | "row" | "fan";
/** Естественный порядок. proximity — по расположению (reading-order); selection — по нажатию; append — в конец (= по нажатию). */
export type NaturalOrder = "proximity" | "selection" | "append";
/** Принудительный порядок ПОВЕРХ естественного. none — не трогать; rank/suit — по номиналу/масти. */
export type SortOverride = "none" | "rank" | "suit" | "center";

export interface AssemblyConfig {
  gatherOn: GatherOn;
  anchor: Anchor;
  form: Form;
  order: NaturalOrder;
  sortOverride: SortOverride;
}

export interface Offset {
  id: string;
  dx: number;
  dy: number;
}

// ——— порядок (два слоя) ———

// Естественный порядок → базовая стратегия collectOrder. proximity=spatial; selection/append=press.
function naturalStrategy(order: NaturalOrder): "press" | "spatial" {
  return order === "proximity" ? "spatial" : "press";
}

/**
 * Упорядочить набор: сперва естественный порядок, затем УСТОЙЧИВО пересортировать override-ключом
 * (равные ключи сохраняют естественный относительный порядок — Array.sort стабилен). Не мутирует.
 */
export function orderItems(items: readonly CollectItem[], order: NaturalOrder, sortOverride: SortOverride): string[] {
  const natCmp = comparatorFor(naturalStrategy(order));
  const seq = [...items].sort((a, b) => natCmp(a, b) || a.press - b.press);
  if (sortOverride === "rank" || sortOverride === "suit") {
    const ovCmp = comparatorFor(sortOverride);
    seq.sort((a, b) => ovCmp(a, b)); // стабильно → tie-break = естественный порядок выше
  }
  // "center"/"custom" — v2 (SELECTION-DESIGN §8); пока проходят как естественный порядок.
  return seq.map((i) => i.id);
}

// ——— форма (геометрия) ———

// Тонкая стопка: карты почти друг на друге, лёгкий сдвиг вверх-вправо (свет сверху справа — как
// deckStack). Раскрытая стопка: заметный сдвиг ВНИЗ, чтобы из-под верхней выглядывали нижние (как
// playStack). Оба — offset ОТ якоря (курсора), индекс-в-индекс с порядком.
function stackOffsets(orderedIds: readonly string[], cardW: number, tight: boolean): Offset[] {
  const stepX = cardW * (tight ? 0.04 : 0.05);
  const stepY = cardW * (tight ? 0.05 : 0.22);
  return orderedIds.map((id, i) => ({ id, dx: i * stepX, dy: tight ? -i * stepY : i * stepY }));
}

/** Оффсеты набора по форме. row делегирует rowAssembly; fan — v2 (пока как row). */
export function formOffsets(orderedIds: readonly string[], form: Form, cardW: number): Offset[] {
  switch (form) {
    case "row":
    case "fan": // v2: дуга через fan.ts; до тех пор — ряд (SELECTION-DESIGN §8)
      return rowAssembly(orderedIds, cardW, cardW * 0.28);
    case "stack-open":
      return stackOffsets(orderedIds, cardW, false);
    case "stack-tight":
    default:
      return stackOffsets(orderedIds, cardW, true);
  }
}

/** Полная сборка: упорядочить (order+override) → разложить по форме. Возвращает id и offsets индекс-в-индекс. */
export function assemble(
  items: readonly CollectItem[],
  config: AssemblyConfig,
  cardW: number,
): { orderedIds: string[]; offsets: Offset[] } {
  const orderedIds = orderItems(items, config.order, config.sortOverride);
  return { orderedIds, offsets: formOffsets(orderedIds, config.form, cardW) };
}

// ——— пресеты (§5): именованные наборы значений рычагов ———
export const ASSEMBLY_PRESETS: Record<string, AssemblyConfig> = {
  // Flow 1 (дефолт): схватил — собралось в сжатую стопку под пальцем, порядок по расположению.
  "grab-to-hand": { gatherOn: "drag-start", anchor: "finger", form: "stack-tight", order: "proximity", sortOverride: "none" },
  // Flow 2: стопка строится на ПЕРВОЙ карте по мере выбора, новые сверху.
  "build-on-first": { gatherOn: "select-each", anchor: "first", form: "stack-tight", order: "selection", sortOverride: "none" },
  // Flow 2-альт: магнитится к ПОСЛЕДНЕЙ выбранной.
  "magnet-latest": { gatherOn: "select-each", anchor: "latest", form: "stack-tight", order: "selection", sortOverride: "none" },
  // Flow 3: складируется в зону-лоток раскрытой стопкой, в конец.
  "tray-zone": { gatherOn: "select-first", anchor: "zone", form: "stack-open", order: "append", sortOverride: "none" },
  // Новое (демо override): ряд, принудительно по номиналу.
  "sorted-row": { gatherOn: "drag-start", anchor: "finger", form: "row", order: "proximity", sortOverride: "rank" },
  // Новое: та же зона, но веером на обзор (v2-форма).
  "fan-review": { gatherOn: "select-first", anchor: "zone", form: "fan", order: "selection", sortOverride: "none" },
  // Новое (под «подглядеть»): раскрытая стопка под пальцем.
  "inspect-open": { gatherOn: "drag-start", anchor: "finger", form: "stack-open", order: "proximity", sortOverride: "none" },
};

export type PresetName = keyof typeof ASSEMBLY_PRESETS;
export const DEFAULT_PRESET: PresetName = "grab-to-hand";
