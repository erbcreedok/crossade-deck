import { comparatorFor, type CollectItem } from "./collectOrder";
import { rowAssembly } from "./rowAssembly";
import { fanAssembly } from "./fanAssembly";

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

const ANCHORS_ALL: readonly Anchor[] = ["finger", "first", "latest", "zone"];
const ANCHORS_NON_FINGER: readonly Anchor[] = ["first", "latest", "zone"];

/**
 * Допустимые якоря для данного `gatherOn` (issue #71, SELECTION-DESIGN §4.C): `finger` имеет смысл
 * только когда собираем В МОМЕНТ старта драга (палец есть) — при любом другом `gatherOn` набор уже
 * собран ДО того, как за него схватились, якорем служит карта/зона, не палец.
 */
export function validAnchorsFor(gatherOn: GatherOn): readonly Anchor[] {
  return gatherOn === "drag-start" ? ANCHORS_ALL : ANCHORS_NON_FINGER;
}

/** Валидна ли связка `gatherOn`+`anchor` (§4.C). Чистая функция — источник правды для UI-блокировки рычагов. */
export function isValidGatherAnchor(gatherOn: GatherOn, anchor: Anchor): boolean {
  return validAnchorsFor(gatherOn).includes(anchor);
}

export interface Offset {
  id: string;
  dx: number;
  dy: number;
  rot?: number; // наклон карты (рад); есть только у веера (issue #69), у ряда/стопки отсутствует = 0
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
  if (sortOverride === "center") {
    // «Пирамида»: сперва по рангу ВОЗРАСТАНИЮ (стабильно, tie-break = естественный), затем разложить
    // «горой» — старшая карта в центр, младшие расходятся к краям (organ-pipe).
    const rankCmp = comparatorFor("rank");
    seq.sort((a, b) => rankCmp(a, b));
    return organPipe(seq).map((i) => i.id);
  }
  return seq.map((i) => i.id);
}

/**
 * «Гора» из возрастающего массива: наименьшие расходятся по краям, наибольший встаёт в центр.
 * Результат слева-направо — битоническая последовательность с пиком в середине (organ-pipe).
 * Пример: [2,4,6,8,10] → [2,6,10,8,4].
 */
function organPipe<T>(asc: readonly T[]): T[] {
  const left: T[] = [];
  const right: T[] = [];
  asc.forEach((v, i) => (i % 2 === 0 ? left : right).push(v)); // младшие — наружу
  return [...left, ...right.reverse()]; // left: мал→больш, right (реверс): больш→мал
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

/** Оффсеты набора по форме. row → rowAssembly, fan → fanAssembly (дуга + наклон, issue #69). */
export function formOffsets(orderedIds: readonly string[], form: Form, cardW: number): Offset[] {
  switch (form) {
    case "fan":
      return fanAssembly(orderedIds, cardW);
    case "row":
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

// ——— gather-на-селект (issue #74): якорь-индекс + перенос офсетов ———

/**
 * Индекс якорной карты в `orderedIds` для gather-на-селект: `first` — стопка растёт от первой
 * выбранной (якорь не двигается), `latest` — стопка «гоняется» за новейшей (якорь = последний
 * индекс). `finger`/`zone` сюда не приходят (используются при `drag-start`/зонной сборке) —
 * безопасный дефолт 0, чтобы функция была тотальной и не бросала. Пустой набор → 0.
 */
export function anchorIndexFor(anchor: Anchor, count: number): number {
  if (count <= 0) return 0;
  return anchor === "latest" ? count - 1 : 0;
}

/**
 * Перенести офсеты так, чтобы `offsets[anchorIndex]` встал в (0,0), сохранив расстояния между
 * картами (жёсткий сдвиг всего набора). `formOffsets` всегда считает офсеты относительно ПЕРВОГО
 * элемента — для якоря `latest` набор нужно «перецепить» на последний, не переизобретая геометрию
 * формы. Не мутирует вход.
 */
export function reanchorOffsets(offsets: readonly Offset[], anchorIndex: number): Offset[] {
  const a = offsets[anchorIndex];
  if (!a) return offsets.map((o) => ({ ...o }));
  return offsets.map((o) => ({ ...o, dx: o.dx - a.dx, dy: o.dy - a.dy }));
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

  // Три именованные схемы issue #74 (SELECTION-DESIGN §5) под ИМЕНАМИ, которые ждут игры/песочница
  // — псевдонимы существующих связок v1, не новая логика: `drag-start` = `grab-to-hand` (дефолт,
  // поведение НЕ меняется), `follow-first` = `build-on-first`, `follow-last` = `magnet-latest`.
  "drag-start": { gatherOn: "drag-start", anchor: "finger", form: "stack-tight", order: "proximity", sortOverride: "none" },
  "follow-first": { gatherOn: "select-each", anchor: "first", form: "stack-tight", order: "selection", sortOverride: "none" },
  "follow-last": { gatherOn: "select-each", anchor: "latest", form: "stack-tight", order: "selection", sortOverride: "none" },
};

export type PresetName = keyof typeof ASSEMBLY_PRESETS;
export const DEFAULT_PRESET: PresetName = "grab-to-hand";
