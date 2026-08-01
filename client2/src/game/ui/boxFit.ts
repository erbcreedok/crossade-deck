// ПОДГОНКА КОРОБКИ И ТЕКСТА — чистая арифметика, общая для всего, что имеет габарит и подпись.
//
// Появилась у кнопки, но кнопке не принадлежит. Коробка с текстом внутри — это и дроп-зона, и
// шильдик дроп-индикатора, и подпись слота, и будущий тултип, и HUD-тег. Оставить правила у Button
// значило бы, что каждая из них однажды заведёт свои — слегка другие, и разъедутся они молча.
//
// Здесь НЕТ Pixi: на вход приходят уже измеренные размеры текста, на выход — числа. Поэтому всё это
// проверяется юнит-тестом, а не глазами по скриншоту (Pixi в node не исполняется).

/** Как выбирается ГАБАРИТ коробки. */
export type BoxFit =
  /** По заданному размеру (пресету). Ряд элементов стоит ровно — важнее плотной упаковки. */
  | "preset"
  /** ПО СОДЕРЖИМОМУ: размер от текста плюс поля. Длинная подпись растягивает коробку. */
  | "content";

/** По какой оси подпись подгоняется под коробку. */
export type TextFitAxis = "horizontal" | "vertical" | "both";

export interface BoxSpec {
  /** Габарит пресета — с чего начинаем при `fit: "preset"`. */
  preset: { w: number; h: number };
  /** Натуральный размер текста при масштабе 1. */
  text: { w: number; h: number };
  fit?: BoxFit;
  padding?: number;
  /** Точный габарит. Перебивает и пресет, и content-fit, но НЕ границы. */
  width?: number;
  height?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

/** Зажать в границы. Не заданы — значение проходит как есть. */
export function clampSize(v: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? 0, v));
}

/**
 * Габарит коробки.
 *
 * Порядок жёсткий, и он же ответ на «что кого перебивает»: способ подбора → явные width/height →
 * границы min/max. Границы применяются ПОСЛЕДНИМИ ко всем случаям сразу — иначе `maxWidth` молча
 * не действовал бы на явную ширину, а ставят его ровно ради этого.
 */
export function fitBox(s: BoxSpec): { w: number; h: number } {
  const pad = s.padding ?? 0;
  const byContent = s.fit === "content";
  let w = byContent ? s.text.w + pad * 2 : s.preset.w;
  let h = byContent ? s.text.h + pad : s.preset.h;
  if (s.width !== undefined) w = s.width;
  if (s.height !== undefined) h = s.height;
  return { w: clampSize(w, s.minWidth, s.maxWidth), h: clampSize(h, s.minHeight, s.maxHeight) };
}

export interface TextFitSpec {
  box: { w: number; h: number };
  text: { w: number; h: number };
  padding?: number;
  /** Уменьшать, если не влезает. */
  shrink?: boolean;
  /** Увеличивать, если есть запас. */
  grow?: boolean;
  axis?: TextFitAxis;
  /** Ниже этого масштаба подпись перестаёт читаться. */
  minScale?: number;
}

/**
 * Масштаб подписи. 1 — как есть.
 *
 * Коэффициенты по осям считаются ОБА, а какой взять — решает `axis`: «влезает по ширине» и
 * «влезает по высоте» это разные требования, и путать их нельзя.
 *
 * Пол `minScale` — не украшение: ниже подпись перестаёт читаться, и «влезла» становится
 * формальностью. Лучше пусть вылезет заметно, чем незаметно исчезнет.
 */
export function fitText(s: TextFitSpec): number {
  const pad = s.padding ?? 0;
  const kx = (s.box.w - pad * 2) / Math.max(1, s.text.w);
  const ky = (s.box.h - pad) / Math.max(1, s.text.h);
  const k = s.axis === "horizontal" ? kx : s.axis === "vertical" ? ky : Math.min(kx, ky);
  if (k < 1 && (s.shrink ?? true)) return Math.max(s.minScale ?? 0.3, k);
  if (k > 1 && s.grow) return k;
  return 1;
}
