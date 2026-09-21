// ЧИСЛА И ФОРМЫ ЭКРАНА СТОЛА — краски, размеры HUD, сроки жестов и типы того, что палец держит в воздухе.
//
// Здесь нет состояния и нет DOM: только то, что экран знает о себе заранее.

import type { Face, SeenCard, Where } from "../src/table/contract.js";
import type { CueKind } from "../src/table/cues.js";
import type { Haptic } from "./haptic.js";

/** Цвет отметки карты в строке — светлые версии красок колоды: буквы строки стоят на сукне с чёрной обводкой. */
export const MENTION_INK = { red: "#e5483f", black: "#e8e0d0", back: "#9fb3cf", four: { s: "#4f95dc", h: "#e5483f", d: "#f0902e", c: "#e8e0d0" } };
export const MUTED_KEY = "crossade.table.muted";
/** Голос этого человека не слушаю — отдельно от «не читать»: слова и голос глушатся порознь. */
export const VOICE_MUTED_KEY = "crossade.table.mutedVoice";
export function readMuted(key = MUTED_KEY): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}
export function writeMuted(keys: Iterable<string>, key = MUTED_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify([...keys]));
  } catch {
    // Нет хранилища — живёт, пока открыт экран.
  }
}

export const T = {
  black: "#0b0704", ink: "#f5ead0", inkDim: "#cdb98f", gold: "#f2c14e",
  well: "#1c120b", panel: "#3a2a1d", panelLight: "#4a3627", wood: "#6b4d2c",
};
/** Как далеко «глаз» от диска компаса: чем ближе, тем сильнее перспектива у положенного диска. */
export const DISC_EYE = 90;
export const BAR_LOOK = { plateHi: "#25321f", plateLo: "#16210f", rim: "#6b4d2c", goldHi: "#f8d885", goldLo: "#b08a26" };

/** НИЖНИЙ БАР И ПОЛОСА РУКИ — числа продукта. Единица HUD — доля стекла, а не единица сукна. */
export const BAR = { size: 0.6, gap: 0.08, margin: 0.22, pad: 0.11, radius: 0.11, tuck: 0.24, fade: 1 };
export const HUD_FAN = { radius: 7, apart: 1.06, edge: 0.1 };
export const HUD_CARDS = 6, HUD_GAP = 0.06, HUD_MARGIN = 0.14, HAND_PAD = 0.16, TUCK_TIP = 0.45;
/** Скрытая рука в окне стула: какая доля высоты карты торчит над краем. */
export const TIP_TUCK = 0.28;
/** На сколько несомая карта висит выше того места, куда летит — доля её высоты. */
export const CARRY_CLEAR = 0.32;
/**
 * НАСКОЛЬКО ЦЕЛЬ КРУГА ДЕРЖИТ ПАЛЕЦ КРЕПЧЕ, ЧЕМ ЛОВИТ. Один порог на вход и на выход — это дрожь:
 * стоит пальцу замереть на границе, и круг перекладывается туда-сюда на каждый пиксель.
 */
export const HAND_ROOM = 0.6 / 4 + 0.06;
export const HUD_UNIT_FRACTION = 0.25;
/**
 * ПОТОЛОК ЕДИНИЦЫ HUD, в пикселях — та, что выходит на айфоне в портрете, плюс запас под мышь.
 *
 * Единица считается от МЕНЬШЕЙ стороны кадра. На телефоне меньшая — ширина (390), и кнопка выходит
 * ~58px, как задумано. На широком экране меньшая — высота, а она там большая: без потолка кнопка
 * раздувается до полутора сотен, а рука от той же единицы съедает низ кадра. Потолок — единственное
 * место, где это чинится: всё, что осталось по высоте, достаётся столу.
 */
export const HUD_UNIT_MAX = Math.round(390 * HUD_UNIT_FRACTION * 1.15);
/**
 * ТА ЖЕ ЕДИНИЦА, ВЫРАЖЕННАЯ ДОЛЕЙ ВЫСОТЫ КАДРА — потому что HUD и рука съедают именно ВЫСОТУ.
 *
 * На айфоне в портрете (390×844) единица — четверть ширины, то есть 0.1155 высоты. В ландшафте
 * ширина огромна, а высоты 390: четверть ширины оставила бы столу полоску. Доля высоты — то же
 * самое число, сказанное в единицах того, чего не хватает.
 */
export const HUD_HEIGHT_SHARE = (390 * HUD_UNIT_FRACTION) / 844;
/**
 * МАКСИМАЛЬНАЯ ШИРИНА ПОЛОСЫ РУКИ, в пикселях — около полутора ширин телефона.
 *
 * Рука не тянется во всю ширину десктопа: она стоит посередине, а боковые поля — не остаток, а
 * осознанный запас под будущие фичи широких экранов.
 */
export const HAND_MAX_PX = 585;
export const CARD = { w: 1, h: 1.4 };

export type Slot = { x: number; y: number; angle: number };
export interface Geom {
  which: string;
  mirror: boolean;
  w: number;
  h: number;
  slots: Slot[];
  barTop?: number;
  box?: TipBox;
}
export interface TipBox { left: number; top: number; w: number; height: number; cw: number; ch: number; rowH: number; rowTop: number; inner: number }

/**
 * КУДА ЦЕЛИТСЯ КАРТА В ВОЗДУХЕ. `chair` — стул на столе: карта уйдёт в конец руки его стула. `back` —
 * стул под локом: он не принимает, и отпущенная над ним карта возвращается туда, откуда её взяли.
 */
export type Aim =
  | { kind: "hand"; which: string; index: number }
  | { kind: "chair"; which: string }
  | { kind: "back" }
  | { kind: "deck"; pile: string }
  /** В открытый тултип стопки, на место `index` снизу. */
  | { kind: "deckAt"; pile: string; index: number }
  /**
   * ТОЧНОЕ МЕСТО ВНУТРИ ЗОНЫ: дыра в круге или то место, откуда карту взяли. Ложась сюда, карта
   * НИЧЕГО не перекладывает — в отличие от `deckAt`, который меняет порядок и зовёт раскладку.
   */
  | { kind: "deckTurn"; pile: string; turn: number }
  | { kind: "felt"; at: { x: number; y: number } };

/** Место в веере: карта или щель — под мою карту в воздухе или под чужую (`carry` — id той карты). */
export interface Gap {
  index: number;
  ink: string;
  carry?: string;
}
/** Место вещи в зоне: где лежит и как повёрнута (`contract.Laid`). Здесь под своим именем — `Laid` занято раскладкой руки. */
export type Place3 = import("../src/table/contract.js").Laid;

export type Laid = { card: SeenCard; slot: Slot; z: number } | { gap: Gap; slot: Slot; z: number };

/**
 * ГДЕ КАРТА НАРИСОВАНА У МЕНЯ СЕЙЧАС — середина на стекле, размер, поворот, сжатие и лицо. `key` —
 * место словами («колода», «рука X, 3-я», «в воздухе у Y»): сменился ключ — карта переехала, и её
 * перелёт рисуется от старого места к новому. Сменились только пиксели (камера, раскладка) — нет.
 */
export interface Place {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  squash: number;
  face?: Face;
}

/** Индикатор колоды: высота — не больше этой доли высоты карты на экране. */
export const GRIP = { most: 0.5 };

/** Двойной тап: второй тап по той же карте не позже этого после первого. */
export const DOUBLE_TAP_MS = 320;
/** Сколько карта переворачивается. */
export const TURN_MS = 320;

/** Тап, а не хват: палец отпустили раньше этого и сдвинули не дальше `TAP_PX`. */
export const TAP_MS = 350;
export const TAP_PX = 8;
/** Перемена кадра в пределах стольких мс после моего касания — моя. */
export const MINE_MS = 700;
declare const __TABLE_BUILD__: string | undefined;
/** Номер сборки стола — подставляет сервер, собирая клиент. */
export const TABLE_BUILD = typeof __TABLE_BUILD__ === "string" ? __TABLE_BUILD__ : "dev";
/** Вибрация на перемену стола. */
export const CUE_HAPTIC: Record<Exclude<CueKind, "shuffle">, Haptic> = { drop: "soft", turn: "rigid", hand: "light", out: "soft", sort: "light", merge: "medium", gather: "medium" };
export const SHUFFLE_TICK_MS = 120;

/** Сколько догадка ждёт ответа сервера, прежде чем уступить столу. */
export const GUESS_MS = 4000;

/** Сколько летит карта из места в место. */
export const FLIGHT_MS = 260;
/** Шафл стопки: круг веера и задержка последней из восьми карт. */
export const SHUFFLE_MS = 1300, SHUFFLE_STAGGER_MS = 18, SHUFFLE_CARDS = 8;

export interface Drag {
  card: SeenCard;
  shown: boolean;
  w: number;
  h: number;
  gx: number;
  gy: number;
  x: number;
  y: number;
  target: Aim;
  markKind?: Aim["kind"];
  hold: number;
  /** Откуда карту взяли — туда она вернётся, если отпустить над стулом под локом. */
  from: Where;
  /** Когда палец последний раз сказал серверу, над чем он (`CARRY_EVERY_MS`). */
  toldAt: number;
  /** Где и когда палец нажал, и ушёл ли дальше порога тапа. */
  sx: number;
  sy: number;
  t0: number;
  moved: boolean;
  /** Несут выделенное лассо: карта под пальцем ведёт за собой всё моё выделение. */
  mass?: boolean;
  /**
   * МЕСТО В КРУГЕ, КОТОРОЕ КАРТА ДЕРЖИТ, ПОКА ЕЁ НЕСУТ. Его видно контуром, и по нему карта
   * возвращается ровно туда, откуда её взяли. Круг при этом не пересобирается: дыра в цепочке — это
   * нормально, пока палец не отпустил.
   */
  ringHome?: { at: { x: number; y: number }; angle: number };
}
