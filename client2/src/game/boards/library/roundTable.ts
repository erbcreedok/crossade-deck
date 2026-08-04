import type { BoardSpec, ZoneLayoutSpec, ZoneSpec } from "../spec";
import { deck36, deck52 } from "./decks";

// КРУГЛЫЙ СТОЛ ПЕСОЧНИЦЫ — конфигурируемый билдер (настройки-как-данные): те же рычаги, что
// потом крутит контекстное меню песочницы. Дефолт владельца: ВСЁ круг и динамично.
//
// Борда — free-бокс (форма rect/circle), в его центре стол карт; вокруг — посадки (seats).
// «Садить карты друг на друга» — это политика фикс-слотов (merge/reject): у динамичных раскладок
// (radial/flow) жители встраиваются в круг/грид и не стопкуются по построению.

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
}

function tableLayout(o: Required<Pick<RoundTableOpts, "shape" | "table" | "slots">>): ZoneLayoutSpec {
  if (o.slots === "dynamic") {
    return o.table === "radial"
      ? { kind: "radial" }
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
  const defaults = { shape: "circle", table: "radial", slots: "dynamic", stacking: true, seats: 4, dealt: 6, deck: 36 } as const;
  const given = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
  const o = { ...defaults, ...given } as Required<RoundTableOpts>;
  const { cards, ids } = o.deck === 52 ? deck52() : deck36();
  const dealt = ids.slice(0, Math.max(0, Math.min(o.dealt, ids.length)));
  const layout = tableLayout(o);
  const boxSide = 760;
  return {
    id: "round-table",
    title: "",
    elements: cards,
    zones: [
      {
        id: "board",
        title: "",
        layout: { kind: "free" },
        cell: { w: boxSide, h: boxSide },
        shape: o.shape === "circle" ? "circle" : undefined,
        policy: { onOccupied: "merge" },
        setup: { 0: ids.slice(dealt.length) },
        focusable: true,
      },
      {
        id: "table",
        title: "",
        layout,
        frame: "dashed",
        // Круг-рамка имеет смысл только у ЖИВОГО контейнера (radial/flow — рамка одна на зону);
        // у фикс-слотов (ring/grid) рамки по ячейкам, круг там рисовал бы кружок на каждой клетке.
        shape: o.shape === "circle" && o.slots === "dynamic" ? "circle" : undefined,
        policy: { onOccupied: o.stacking ? "merge" : "reject" },
        setup: tableSetup(layout, dealt),
        focusable: true,
      },
      { id: "place", title: "", layout: { kind: "seats" }, policy: { onOccupied: "reject" } },
    ],
    seats: { count: { fixed: Math.max(1, o.seats) }, show: "backs", swap: true },
    hand: { reorder: true },
    actions: [],
  };
}
