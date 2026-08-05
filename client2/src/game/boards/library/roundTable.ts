import type { BoardSpec, ZoneLayoutSpec, ZoneSpec } from "../core/spec";
import { CARD } from "../../crossade/tree";
import { ringPresetOf, type RingPreset, type RingPresetName } from "./ringPresets";
import { deck36, deck52 } from "./decks";

// КРУГЛЫЙ СТОЛ ПЕСОЧНИЦЫ — конфигурируемый билдер (настройки-как-данные): те же рычаги, что
// потом крутит контекстное меню песочницы. Дефолт владельца: ВСЁ круг и динамично.
//
// Борда — free-бокс (форма rect/circle), в его центре стол карт; вокруг — посадки (seats).
// «Садить карты друг на друга» — это политика фикс-слотов (merge/reject): у динамичных раскладок
// (radial/flow) жители встраиваются в круг/грид и не стопкуются по построению.

// РАЗМЕТКА КРУПНЕЕ КАРТЫ (правило владельца: «карты слишком большие к масштабу зон»). Ячейка зоны
// задаёт РАЗМЕТКУ и разнос слотов, а карта рисуется своим размером (CARD, nodeFactory) и в ячейке
// центрируется — значит поле вокруг карты растёт, а сама она нет. Полтора размера карты.
const ZONE_CELL = { w: Math.round(CARD.w * 1.5), h: Math.round(CARD.h * 1.5) };

/** Внешний круг — МИНИМУМ габарита. Фактический считает дерево (`roundTableTree#ringBox`): кольцо
 *  между центром и внешним кругом обязано быть не тоньше трёх карт, а центр живой — радиальный
 *  круг растёт с числом жителей, и одно зашитое число правило не удержало бы. */
const BOX_MIN = 1140;

export interface RoundTableOpts {
  /** Форма борды-бокса и стола: ровный круг (дефолт) или прямоугольник. */
  shape?: "circle" | "rect";
  /** Рассадка карт стола: по радиусу (дефолт) или сеткой. */
  table?: "radial" | "grid";
  /** Слоты стола: динамичные (дефолт) или фиксированное число. */
  slots?: "dynamic" | number;
  /** Для ФИКС-слотов: можно ли класть карты друг на друга (merge) или слот один-жилец (reject). */
  stacking?: boolean;
  /** Посадочные места вокруг стола. */
  seats?: number;
  /** Сколько карт разложить на стол сразу (витрине нужно что показывать). */
  dealt?: number;
  /** Размер колоды. */
  deck?: 36 | 52;
  /** Как ведёт себя круг стола, когда карт прибавляется: пресет по имени (`grow` — растёт без
   *  предела, `capped` — стартует просторным и упирается в потолок) или свои числа. */
  ring?: RingPresetName | RingPreset;
}

function tableLayout(o: Required<Pick<RoundTableOpts, "shape" | "table" | "slots" | "seats">>, ring: RingPreset): ZoneLayoutSpec {
  if (o.slots === "dynamic") {
    // Минимум позиций круга — по числу игроков, но не теснее, чем просит пресет: место каждому
    // игроку и сразу удобный простор. Потолок — от пресета: 0 значит «расти без предела».
    return o.table === "radial"
      ? { kind: "radial", min: Math.max(1, o.seats, ring.min), ...(ring.max ? { max: ring.max } : {}) }
      : { kind: "flow", cols: { min: 3, max: 4 }, grow: "square", center: true };
  }
  if (o.table === "radial") return { kind: "ring", count: o.slots };
  const cols = Math.ceil(Math.sqrt(o.slots));
  return { kind: "grid", cols, rows: Math.ceil(o.slots / cols) };
}

/** Стартовая раскладка стола: dealt карт по слотам (фикс — по одному в слот, динамика — в контейнер). */
function tableSetup(layout: ZoneLayoutSpec, dealt: readonly string[]): ZoneSpec["setup"] {
  if (!dealt.length) return undefined;
  if (layout.kind === "ring") return Object.fromEntries(dealt.map((id, i) => [i, [id]]));
  if (layout.kind === "grid") {
    return Object.fromEntries(dealt.map((id, i) => [`r${Math.floor(i / layout.cols)}c${i % layout.cols}`, [id]]));
  }
  return { 0: dealt };
}

export function roundTableBoard(opts: RoundTableOpts = {}): BoardSpec {
  // Спред затирал бы дефолты явными undefined (скрытые рычаги Storybook отдают именно их).
  const defaults = { shape: "circle", table: "radial", slots: "dynamic", stacking: true, seats: 4, dealt: 6, deck: 36, ring: "grow" } as const;
  const given = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
  const o = { ...defaults, ...given } as Required<RoundTableOpts>;
  const { cards, ids } = o.deck === 52 ? deck52() : deck36();
  const dealt = ids.slice(0, Math.max(0, Math.min(o.dealt, ids.length)));
  const layout = tableLayout(o, ringPresetOf(o.ring));
  return {
    id: "round-table",
    title: "",
    elements: cards,
    zones: [
      {
        id: "board",
        title: "",
        layout: { kind: "free" },
        cell: { w: BOX_MIN, h: BOX_MIN },
        shape: o.shape === "circle" ? "circle" : undefined,
        policy: { onOccupied: "merge" },
        // Колода (слот 0): снеп по нахлёсту с магнитом, ТОЛЬКО карты и только ровные (≤30°) —
        // сильно наклонённую со стола можно впихнуть лишь пальцем; фишку — никак.
        drop: { hit: "overlap", only: "card", maxTilt: 30, magnet: true },
        setup: { 0: ids.slice(dealt.length) },
        focusable: true,
      },
      {
        id: "table",
        title: "",
        layout,
        cell: ZONE_CELL,
        frame: "dashed",
        // Круг — И рамка живого контейнера (radial/flow), И ячейки фикс-слотов (ring), И пустые
        // позиции-заготовки: слот-плейсхолдер читается кружком, не «квадратом». Сетка (grid) —
        // намеренно прямоугольная: это сетка.
        shape: o.shape === "circle" && layout.kind !== "grid" ? "circle" : undefined,
        policy: { onOccupied: o.stacking ? "merge" : "reject" },
        // Центр ловит по ЦЕНТРУ карты: край, заехавший на круг, не перебивает внешний круг —
        // рядом с центром по-прежнему можно класть свободно.
        drop:
          layout.kind === "radial" || layout.kind === "flow"
            ? { hit: "center", shape: o.shape === "circle" ? "circle" : "rect" }
            : undefined,
        setup: tableSetup(layout, dealt),
        focusable: true,
      },
      {
        id: "place",
        title: "",
        layout: { kind: "seats" },
        cell: ZONE_CELL,
        // Посадочные слоты вокруг стола — тоже кружки (владелец: всё по дефолту круг).
        shape: o.shape === "circle" ? "circle" : undefined,
        policy: { onOccupied: "reject" },
      },
    ],
    seats: { count: { fixed: Math.max(1, o.seats) }, show: "backs", swap: true },
    hand: { reorder: true },
    actions: [],
  };
}
