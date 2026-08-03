// БОРДА (Board) — самостоятельная сборка игрового стола: зоны (у каждой своё поле слотов со
// своей раскладкой), места игроков, панель действий, смарт-мок вместо правил. Контракт —
// docs/BOARDS-DESIGN.md §4. ДАННЫЕ, без Pixi и без классов: конкретная борда (шахматы, дурак,
// крестовый) — литерал BoardSpec, а не подкласс (правила-как-данные, пресеты вместо наследования).
//
// Слово Board принадлежит ЭТОМУ слою; поле слотов — SlotField (game/slotfield/, переименовано
// 2026-08-03 ровно ради этого).

import type { OnOccupied } from "../slotfield/fieldZone";

// ---------------------------------------------------------------------------------------------
// Ключи: единый словарь адресов вместо хардкода строк по деревьям (шов №3 из BOARDS-ANALYSIS)
// ---------------------------------------------------------------------------------------------

/** Адрес слота на борде: `зона:слот` («field:r3c4», «chain:2», «discard:0»). Рука и места —
 *  тоже зоны этого словаря («hand:p1», «seat:p2»): одна адресация на всё. */
export type SlotKey = string;

export function slotKey(zone: string, slot: string | number): SlotKey {
  return `${zone}:${slot}`;
}

export function zoneOf(key: SlotKey): string {
  const at = key.indexOf(":");
  return at < 0 ? key : key.slice(0, at);
}

/** Спека зоны по её РАНТАЙМ-имени: экземпляр perSeat-зоны («gear@p2») ведёт к базовой («gear»). */
export function baseZoneId(zoneId: string): string {
  const at = zoneId.indexOf("@");
  return at < 0 ? zoneId : zoneId.slice(0, at);
}

/** Рантайм-имя perSeat-зоны у конкретного места. */
export function seatZoneId(zoneId: string, seatId: string): string {
  return `${zoneId}@${seatId}`;
}

export function slotOf(key: SlotKey): string {
  const at = key.indexOf(":");
  return at < 0 ? "" : key.slice(at + 1);
}

// ---------------------------------------------------------------------------------------------
// Элементы: данные для registry (тип → фабрика визуала живёт на стороне сцены)
// ---------------------------------------------------------------------------------------------

export type ElementDef =
  | { kind: "card"; id: string; face: string }
  | { kind: "piece"; id: string; glyph: string; dark: boolean }
  | { kind: "chip"; id: string; denom: number };

// ---------------------------------------------------------------------------------------------
// Зоны
// ---------------------------------------------------------------------------------------------

export type ZoneLayoutSpec =
  | { kind: "grid"; cols: number; rows: number }
  | { kind: "ring"; count: number }
  | { kind: "pile" }
  /** Цепочка/лента: слоты в ряд, новый слот открывается в конце (крестовый, доминошки). */
  | { kind: "chain" }
  /** РЕОРДЕР-ГРИД (бывшее «Поле» песочницы): один живой контейнер, раскладка пересчитывает
   *  колонки/строки по числу жителей (min/max/grow), дроп — вставка на позицию или свап. */
  | { kind: "flow"; cols?: { min?: number; max?: number }; rows?: { min?: number; max?: number };
      grow?: "square" | "down" | "right"; reserve?: boolean };

export interface ZonePolicySpec {
  /** Исход дропа в ЗАНЯТЫЙ слот (slotfield/fieldZone.ts). merge — поверх; swap — обмен;
   *  capture — вытеснить (вытесненный уезжает в `displaceTo`); reject — отказ. */
  onOccupied: OnOccupied;
  /** Куда уезжает вытесненная capture'ом фигура (ключ зоны). Обязателен при capture. */
  displaceTo?: string;
  /** Потолок стопки слота (undefined — без потолка). */
  maxSize?: number;
}

export interface ZoneSpec {
  id: string;
  title: string;
  layout: ZoneLayoutSpec;
  policy: ZonePolicySpec;
  /** Габарит ячейки зоны (шахматной клетке не нужен карточный прямоугольник). Дефолт — карта. */
  cell?: { w: number; h: number };
  /** Зона У КАЖДОГО МЕСТА (манчкинские «шмотки»): дерево создаёт экземпляр на игрока с ключами
   *  `id@seat:слот`; политика и раскладка общие. */
  perSeat?: boolean;
  /** Что значит дроп ВНУТРИ зоны (flow-грид, рука): вставка на позицию или обмен местами. */
  reorder?: "insert" | "swap";
  /** Ассет фона (шахматная доска, поле монополии) — рисует сцена, спека только называет. */
  background?: "chessboard" | "ringtrack";
  /** Начальные жители: слот → id элементов (низ → верх). Слоты вне списка пусты. */
  setup?: Readonly<Record<string, readonly string[]>>;
}

// ---------------------------------------------------------------------------------------------
// Места и рука
// ---------------------------------------------------------------------------------------------

export interface SeatsSpec {
  count: { fixed: number } | { min: number; max: number };
  /** Подача чужого места: рубашки его руки / счёт карт / стек фишек / ничего. */
  show: "backs" | "count" | "chips" | "none";
  /** Можно ли меняться местами («сесть за стул»). */
  swap: boolean;
}

export interface HandSpec {
  reorder: boolean;
}

// ---------------------------------------------------------------------------------------------
// Действия и мок
// ---------------------------------------------------------------------------------------------

/** Команды мок-порта борды. Сериализуемый юнион: кнопка ActionBar и палец — два драйвера
 *  одного порта (CONTROL-DESIGN). Правил тут нет — мок исполняет честно (BOARDS-DESIGN §3). */
export type BoardCommand =
  | { t: "move"; el: string; from: SlotKey; to: SlotKey }
  /** Раздать: from-зона → руки. each: число или «всю колоду поровну, дилеру последним». */
  | { t: "deal"; from: string; each: number | "all-even-dealer-last" }
  | { t: "shuffle"; zone: string }
  /** Передать ход дальше по кругу (dir учтён) / развернуть направление. */
  | { t: "turn" }
  | { t: "reverse" }
  /** Вернуть борду к setup-состоянию спеки. */
  | { t: "reset" }
  | { t: "sit"; who: string; seat: string }
  | { t: "stand"; who: string }
  /** Бросок кубиков — мок-рандом, результат ложится в state.dice. */
  | { t: "roll" }
  /** Переставить СВОЮ руку (перестановка того же состава — иначе отказ). */
  | { t: "reorderHand"; seat: string; order: readonly string[] }
  /** Переставить ЛЮБОЙ контейнер (flow-грид): та же дисциплина перестановки. */
  | { t: "reorderSlot"; key: SlotKey; order: readonly string[] };

export interface ActionSpec {
  id: string;
  label: string;
  command: BoardCommand;
}

export interface MockSpec {
  /** Раздача при старте (та же семантика, что команда deal). */
  deal?: { from: string; each: number | "all-even-dealer-last" };
  /** Сколько кубиков у борды (кнопка roll что-то значит только при dice > 0). */
  dice?: number;
}

// ---------------------------------------------------------------------------------------------
// Борда целиком
// ---------------------------------------------------------------------------------------------

export interface BoardSpec {
  id: string;
  title: string;
  elements: readonly ElementDef[];
  zones: readonly ZoneSpec[];
  seats: SeatsSpec;
  /** Личная рука игрока. Нет поля — нет рук (шахматы). */
  hand?: HandSpec;
  actions: readonly ActionSpec[];
  mock?: MockSpec;
}

export function elementById(spec: BoardSpec): ReadonlyMap<string, ElementDef> {
  return new Map(spec.elements.map((e) => [e.id, e]));
}

/** Сколько слотов у зоны по её раскладке (chain — живой, считается по состоянию). */
export function zoneSlotCount(zone: ZoneSpec): number | "dynamic" {
  switch (zone.layout.kind) {
    case "grid":
      return zone.layout.cols * zone.layout.rows;
    case "ring":
      return zone.layout.count;
    case "pile":
      return 1;
    case "chain":
    case "flow":
      return "dynamic";
  }
}
