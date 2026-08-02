import type { PieceSpec } from "../../game/ui/pieceKinds";
import type { ArgTypeEntry } from "../harness/paramArgs";

// ПОЛНАЯ карта опций не-карточного элемента — сестра cardArgs.ts, и до сих пор её не было. Из-за
// этого фишка оставалась единственным примитивом стола, у которого в каталоге нельзя покрутить
// НИЧЕГО: ни цвет, ни номинал, ни радиус, ни тип. Смотреть на неё можно было только в готовом ряду.
//
// `PieceSpec` — размеченное объединение (chip | chess), поэтому плоский набор аргументов шире любой
// одной ветки: лишние для текущего типа просто не читаются. Зато `satisfies Record<keyof PieceArgs,…>`
// внизу по-прежнему ломает сборку, если у спеки появилось поле, не описанное здесь.
//
// Все правки — пересборкой: визуал элемента печётся в конструкторе по спеке (pieceVisual), живого
// сеттера «перекрасить фишку» у него нет и заводить его ради каталога было бы неправдой.

export type PieceKind = PieceSpec["kind"];

export interface PieceArgs {
  kind: PieceKind;
  /** chip: заливка фишки. Контрол цвета отдаёт строку «#rrggbb», спека хочет число — см. toColor.
   *  Тип поэтому union: панель и движок говорят о цвете по-разному, и врать ни одному нельзя. */
  color: number | string;
  /** chip: номинал на фишке; пустая строка — фишка без номинала. */
  denom: string;
  /** chess: тёмная сторона. */
  dark: boolean;
  /** chess: символ фигуры (♞ ♜ ♝ …). */
  glyph: string;
  /** Радиус элемента; габарит — r*2. Задаётся не спекой, а постановкой (ctx.piece). */
  radius: number;
  /**
   * Политика видимости ЯКОРЯ — метки места, откуда элемент унесли.
   *
   * Была тремя отдельными страницами, хотя это одно значение. Разница видна ТОЛЬКО в движении:
   * пока элемент дома, все три выглядят одинаково — унесите его и посмотрите, что осталось.
   */
  anchor: "away" | "empty" | "always";
  /** Высота над столом (ось z). У лежащего на столе — 0. */
  z: number;
}

export const PIECE_KINDS: PieceKind[] = ["chip", "chess"];
const GLYPHS = ["♞", "♜", "♝", "♛", "♚", "♟"];

export const PIECE_ARG_TYPES = {
  kind: { name: "kind", description: "chip — фишка номинала, chess — шахматная фигура", control: { type: "select" }, options: PIECE_KINDS },
  color: { name: "color", description: "заливка фишки", control: { type: "color" }, if: { arg: "kind", eq: "chip" } },
  denom: { name: "denom", description: "номинал на фишке; пусто — без номинала", control: { type: "text" }, if: { arg: "kind", eq: "chip" } },
  dark: { name: "dark", description: "тёмная сторона", control: { type: "boolean" }, if: { arg: "kind", eq: "chess" } },
  glyph: { name: "glyph", description: "символ фигуры", control: { type: "select" }, options: GLYPHS, if: { arg: "kind", eq: "chess" } },
  anchor: { name: "anchor.show", description: "когда видна метка места: away — когда элемент унесли; empty — когда там пусто; always — всегда. Разницу видно только в движении", control: { type: "select" }, options: ["away", "empty", "always"] },
  z: { name: "z", description: "высота над столом (ui/elevation.ts). У лежащего — 0. Показывается размером и тенью", control: { type: "range", min: 0, max: 1, step: 0.02 } },
  radius: { name: "radius", description: "радиус элемента; габарит r*2", control: { type: "range", min: 16, max: 90, step: 2 } },
} satisfies Record<keyof PieceArgs, ArgTypeEntry>;

export const PIECE_ARGS: PieceArgs = { kind: "chip", color: "#c79a3e", denom: "25", dark: true, glyph: "♞", radius: 44, anchor: "away", z: 0 };

/**
 * Плоские аргументы → спека нужной ветки. Разбор union'а живёт РОВНО ТУТ: у места вызова его быть
 * не должно, иначе каждая стори повторяла бы одно и то же ветвление.
 */
export function specFrom(a: PieceArgs): PieceSpec {
  return a.kind === "chip" ? { kind: "chip", color: toColor(a.color), denom: a.denom } : { kind: "chess", dark: a.dark, glyph: a.glyph };
}

/** Контрол цвета отдаёт строку («#c79a3e»), спека хочет число. Число пропускаем как есть. */
function toColor(v: number | string): number {
  return typeof v === "number" ? v : Number(`0x${String(v).replace("#", "")}`);
}
