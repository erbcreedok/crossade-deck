import { TEX_H, TEX_W } from "../engine/constants";
import { screenLift } from "./elevation";
import type { EffectFrame } from "../anim/destroyStyles";

// ТЕНЬ — один закон на все предметы стола. Форма (прямоугольник карты, эллипс фишки) — параметр;
// смещение, рост и следование за подъёмом общие.

export interface ShadowShape {
  x: number;
  y: number;
  hw: number;
  hh: number;
  rot: number;
  /** Эллипс вместо прямоугольника: круглая фишка, овальная подставка фигуры. */
  round?: boolean;
  /** Точная форма: маска эффекта (горение, шреддер). */
  poly?: number[][];
  /** Во сколько растянуть `poly` по X. Не задан — форма КАРТОЧНАЯ (в координатах текстуры). */
  polyK?: number;
  /** То же по Y. */
  polyKy?: number;
  /**
   * КАРТИНКА предмета вместо геометрии: тень фигуры — это она сама, только тёмная. Габарит
   * (`bx/by/bw/bh`) — в локальных координатах визуала, `k` — во сколько он нарисован. Если рядом
   * лежит `poly` (маска эффекта), она эту картинку режет — тем же кадром, что и сам предмет.
   */
  image?: { texture: unknown; bx: number; by: number; bw: number; bh: number; k: number };
}

/** Как высота над столом превращается в смещение и размер. Подбирается глазами, потому и данные. */
export interface ShadowTuning {
  /** Размер тени у ЛЕЖАЩЕГО предмета, в долях его размера. 1 — ровно по нему. */
  base: number;
  /** Насколько тень крупнее с высотой. Действует только у `attach: "table"` — см. attach. */
  growth: number;
  /** Смещение влево у лежащего и добавка с высотой, в долях размера предмета. */
  dx: number;
  dxLift: number;
  /** То же вниз. Свет сверху справа → вниз тень уходит сильнее, чем вбок. */
  dy: number;
  dyLift: number;
  /** К чему тень привязана. Два разных источника света, промежуточного между ними не бывает. */
  attach: ShadowAttach;
}

/**
 * К чему привязана тень.
 *
 *   element — ПРИКЛЕЕНА к предмету: едет вместе с ним, размер постоянный. Высоту читаем по ЗАЗОРУ
 *             между предметом и тенью. Так ведут себя drop-shadow интерфейса.
 *   table   — ЛЕЖИТ на столе: предмет уходит вверх, пятно остаётся на месте, отдаляется и растёт.
 *             Так падает свет от близкого источника на настоящем столе.
 *
 * Это РАЗНЫЕ источники света, а не концы одной шкалы: «наполовину приклеенная» тень не значит
 * ничего — она одновременно едет с предметом и остаётся, и высота перестаёт читаться вовсе.
 */
export type ShadowAttach = "element" | "table";

export const SHADOW_TUNING: ShadowTuning = { attach: "element", base: 1, growth: 0, dx: 0.025, dxLift: 0.16, dy: 0.03, dyLift: 0.42 };

export const SHADOW_ON_TABLE: ShadowTuning = { attach: "table", base: 1, growth: 0.45, dx: 0.025, dxLift: 0.3, dy: 0.03, dyLift: 0.75 };

export interface ShadowSpec {
  /** МЕСТО НА СТОЛЕ. Подъём его не меняет — см. ui/elevation.ts. */
  px: number;
  py: number;
  /** Боковое дрожание («стоп»-блок) — экран, а не высота. */
  shakeX?: number;
  /** ВЫСОТА над столом. Единственное, от чего зависит поведение тени. */
  z: number;
  /** Полуразмеры предмета В ПОКОЕ. */
  hw: number;
  hh: number;
  rotation?: number;
  /** Эллипс (фишка, фигура) вместо карточного прямоугольника. */
  round?: boolean;
  /** Сдвиг тени к ОСНОВАНИЮ: у стоящей фигуры она под ножкой, а не под центром. */
  baseDy?: number;
  /** Горизонтальное сжатие при перевороте (spinScale 1→0→1): тень сужается в такт. */
  spinX?: number;
  /** Экранное смещение, не являющееся высотой (дыхание, дрожь): приклеенная тень едет за ним. */
  screenY?: number;
  /** Чем мерить смещение; по умолчанию ширина. Не высотой: у стоящей фигуры она мала (плоский овал). */
  reach?: number;
  /** Форма: маска эффекта (горение, шреддер). */
  poly?: number[][] | null;
  /** Картинка предмета как его тень — точнее любой геометрии. Маска эффекта её РЕЖЕТ, а не заменяет. */
  image?: { texture: unknown; bx: number; by: number; bw: number; bh: number; k: number } | null;
  /** Множитель для `poly` по X. Не задан — форма карточная, в координатах текстуры. */
  polyK?: number;
  /** Множитель по Y: меньше — силуэт приплюснут (тень стоящей фигуры лежит на столе). */
  polyKy?: number;
  /** Угасание от эффекта, 0..1. null — тень пора убрать совсем. */
  fade?: number | null;
}

/**
 * ОДНА провязка «кадр анимации → тень» на все предметы стола.
 *
 * Тень не анимируют — её ВЫВОДЯТ. Но раньше выводили в двух местах: карта складывала кадр эффекта
 * со своим состоянием у себя, фигура — у себя, и любое новое поле кадра пришлось бы вписывать
 * дважды. Здесь это делается один раз: предмет описывает СЕБЯ (место, высота, форма), эффект
 * добавляется сверху, и всё, что появится в кадре завтра, доедет до тени само.
 */
export function withEffect<T extends { z: number; shakeX?: number; screenY?: number; rotation?: number }>(base: T, f: EffectFrame | null | undefined): T {
  if (!f) return base;
  return {
    ...base,
    shakeX: (base.shakeX ?? 0) + f.dx,
    screenY: (base.screenY ?? 0) + f.dy,
    // Масштаб эффекта — это ВЫСОТА: взлетевший предмет крупнее и выше над столом.
    z: base.z + Math.max(0, f.scale - 1),
    rotation: (base.rotation ?? 0) + f.rot,
    // Маска эффекта не подменяет форму тени, а режет её — тем же кадром, что режет предмет.
    poly: f.mask,
    fade: f.shadow,
  };
}

export function shadowOf(s: ShadowSpec, t: ShadowTuning = SHADOW_TUNING): ShadowShape | null {
  if (s.fade === null) return null;
  const z = Math.max(0, s.z);
  const reach = s.reach ?? s.hw * 2;
  const stuck = t.attach === "element";
  // Рост — свойство ЛЕЖАЩЕЙ тени: пятно на столе удаляется от источника и растёт. У приклеенной
  // размер меняться не может, она едет вместе с предметом.
  const grow = t.base + (stuck ? 0 : z * t.growth);
  return {
    x: s.px + (s.shakeX ?? 0) - reach * (t.dx + z * t.dxLift),
    // Тень едет за подъёмом (follow) и отстаёт от него (dyLift): предмет поднимается быстрее,
    // зазор растёт — он и читается как высота.
    y: s.py + (s.baseDy ?? 0) + (stuck ? screenLift(z, reach) + (s.screenY ?? 0) : 0) + reach * (t.dy + z * t.dyLift),
    hw: s.hw * grow * (s.spinX ?? 1) * (s.fade ?? 1),
    hh: s.hh * grow * (s.fade ?? 1),
    rot: s.rotation ?? 0,
    ...(s.round ? { round: true } : {}),
    ...(s.poly ? { poly: s.poly } : {}),
    ...(s.poly && s.polyK !== undefined ? { polyK: s.polyK } : {}),
    ...(s.poly && s.polyKy !== undefined ? { polyKy: s.polyKy } : {}),
    ...(s.image ? { image: s.image } : {}),
  };
}

/** Силуэт карты: прямоугольник её текстуры, смещение меряется высотой карты. */
export function cardShadow(s: Omit<ShadowSpec, "hw" | "hh" | "reach"> & { scaleFactor: number }, t?: ShadowTuning): ShadowShape | null {
  return shadowOf({ ...s, hw: (TEX_W * s.scaleFactor) / 2, hh: (TEX_H * s.scaleFactor) / 2, reach: TEX_H * s.scaleFactor }, t);
}
