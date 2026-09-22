// БАР И ЗНАЧКИ — какие секции и кнопки есть у нижнего бара и как каждая нарисована.
//
// Данные, а не код: экран читает отсюда, что показать, и ничего здесь не решает.

import type { Arrange, ChairFlag, GatherSide } from "../src/table/contract.js";

/** Флаги стула в нижнем HUD и в окне стула — одни и те же кнопки, одни и те же значки. */
export const RIGHTS = ["lock", "hide", "reject", "forever", "out"] as const satisfies readonly ChairFlag[];
export const FOLDS = ["fan", "shrink", "tuck"] as const;
export const ORDERS = ["suit", "rank", "reverse", "shuffle"] as const satisfies readonly Arrange[];
/**
 * СЕКЦИИ НИЖНЕГО БАРА. Сначала в баре только кнопки секций; нажатая уезжает влево и горит, остальные
 * улетают, прилетают кнопки секции. Та же кнопка ещё раз — секция закрыта.
 */
/**
 * ЛАССО — секция-режим: пока она открыта, касания стола и карт выделяют, а не берут. В баре три раздела:
 * инструмент (курсор или лассо), вид грэба (одним кликом по кругу) и сторона при сборке в стопку (по кругу).
 */
export const LASSO = ["cursor", "lasso", "grab", "side"] as const;
export const SECTIONS = ["pose", "chair", "order", "lasso", "say"] as const;
export type Section = (typeof SECTIONS)[number];
export type BarKey = (typeof RIGHTS)[number] | (typeof FOLDS)[number] | (typeof ORDERS)[number] | (typeof LASSO)[number] | "leave";
/** Вид грэба выделенного: стянуть к пальцу (карта под пальцем сверху) или нести, как лежат. */
export type GrabMode = "collect" | "keep";
/** «Диалог» — не секция кнопок: он открывает клавиатуру вместо руки (`talk.ts`). */
export const SUBS: Record<Section, readonly BarKey[]> = { pose: FOLDS, chair: [...RIGHTS, "leave"], order: ORDERS, lasso: LASSO, say: [] };
/** Сколько идёт смена секций в баре. */
export const SECTION_MS = 240;
export const GLYPH: Record<BarKey | ChairFlag | `sec-${Section}` | "back" | "deck" | "pin" | "eye" | "mic" | "ear" | "shut" | "seal" | `grab-${GrabMode}` | `side-${GatherSide}`, string> = {
  /** Курсор-хват — ладонь. */
  cursor: '<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10"/><path d="M11 9.5V4a1.5 1.5 0 0 1 3 0v6"/><path d="M14 9.5V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M17 10a1.5 1.5 0 0 1 3 0v3.5a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L4 14.6a1.5 1.5 0 0 1 2.3-1.9L8 14.5V9a1.5 1.5 0 0 1 3 0"/>',
  lasso: '<ellipse cx="13" cy="9" rx="8" ry="5.5" stroke-dasharray="3 2.4"/><path d="M8 13.5c-2 1.5-2.5 4 0 5.5 1.5 1 3 .5 3.5-.5"/>',
  grab: "",
  side: "",
  /** Стянуть к пальцу — четыре стрелки в точку. */
  "grab-collect": '<path d="M4 4l5 5"/><path d="M9 5v4H5"/><path d="M20 4l-5 5"/><path d="M15 5v4h4"/><path d="M4 20l5-5"/><path d="M5 15h4v4"/><path d="M20 20l-5-5"/><path d="M19 15h-4v4"/>',
  /** Как лежат — три карты врозь со стрелкой переноса. */
  "grab-keep": '<rect x="3" y="3" width="6" height="8" rx="1"/><rect x="14" y="6" width="6" height="8" rx="1"/><rect x="7" y="14" width="6" height="7" rx="1" transform="rotate(-8 10 17)"/>',
  /** Сторона как лежала — карта наполовину лицом, наполовину рубашкой. */
  "side-keep": '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 12h12"/><path d="M9 6.5l1.5 2.5L12 6.5l1.5 2.5L15 6.5"/>',
  /** Все рубашкой вверх — плетёнка. */
  "side-down": '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M8 7l8 10"/><path d="M16 7L8 17"/><path d="M8 12h8"/>',
  /** Все лицом вверх — масть. */
  "side-up": '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 8c-1.5 2-3 3-3 4.5a1.5 1.5 0 0 0 3 .3 1.5 1.5 0 0 0 3-.3C15 11 13.5 10 12 8z"/>',
  "sec-lasso": '<ellipse cx="12" cy="9" rx="8" ry="5.5"/><path d="M7 13c-2 1.5-2.5 4 0 5.5 1.5 1 3 .5 3.5-.5"/><path d="M15 15l4 6"/>',
  lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3"/><path d="M5 11h14v10H5z"/>',
  /** Отклонять — рука не принимает: стрелка в руку, перечёркнутая. */
  reject: '<path d="M12 3v8"/><path d="M8.5 7.5 12 11l3.5-3.5"/><path d="M4 14h16v6H4z"/><path d="M4 20 20 4"/>',
  hide: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9 9 0 0 1 22 12s-1.5 2.6-4.3 4.5"/><path d="M6.4 7.6C3.9 9.3 2 12 2 12s4 7 10 7c1.5 0 2.9-.3 4.1-.9"/>',
  forever: '<path d="M6.5 8.5C3.5 8.5 2 10.2 2 12s1.5 3.5 4.5 3.5C10 15.5 14 8.5 17.5 8.5 20.5 8.5 22 10.2 22 12s-1.5 3.5-4.5 3.5C14 15.5 10 8.5 6.5 8.5z"/>',
  reverse: '<rect x="7.5" y="4" width="9" height="16" rx="1.5"/><path d="M4 9.5A9 9 0 0 1 8.2 4.4"/><path d="M8.6 2.2 8.2 4.4l2.2.5"/><path d="M20 14.5A9 9 0 0 1 15.8 19.6"/><path d="M15.4 21.8l.4-2.2-2.2-.5"/>',
  fan: '<rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(-28 12 20)"/><rect x="9" y="5" width="6" height="12" rx="1"/><rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(28 12 20)"/>',
  shrink: '<rect x="8" y="5" width="8" height="14" rx="1"/><path d="M2 12h4"/><path d="M4 9.5 6.5 12 4 14.5"/><path d="M22 12h-4"/><path d="M20 9.5 17.5 12l2.5 2.5"/>',
  tuck: '<rect x="8" y="3" width="8" height="11" rx="1"/><path d="M3 18h18"/><path d="M12 14v-4"/><path d="M9.5 12.5 12 15l2.5-2.5"/>',
  leave: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  /** Не раздавать: карта перечёркнута. */
  out: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M4 4l16 16"/>',
  suit: '<path d="M7 4c-2 2.5-4 4-4 6a2 2 0 0 0 4 .5 2 2 0 0 0 4-.5c0-2-2-3.5-4-6z"/><path d="M7 11v3"/><path d="M17 20c2-2.5 4-4 4-6a2 2 0 0 0-4-.5 2 2 0 0 0-4 .5c0 2 2 3.5 4 6z"/>',
  rank: '<path d="M4 7h3v10"/><path d="M4 17h6"/><path d="M14 7h4a2 2 0 0 1 0 4h-2a2 2 0 0 0-2 2v4h6"/>',
  shuffle: '<path d="M3 7h4l10 10h4"/><path d="M3 17h4l3-3"/><path d="M14 10l3-3h4"/><path d="M18.5 4.5 21 7l-2.5 2.5"/><path d="M18.5 14.5 21 17l-2.5 2.5"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  pin: '<path d="M9 3h6l-1 6h2l1 5H7l1-5h2L9 3z"/><path d="M12 14v7"/>',
  /** Микрофон — зона записи голосового и значок на аватаре пишущего. */
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  ear: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
  /** Глаз наблюдателя — у кого открыто это окно. */
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
  /** Приёмка закрыта — лоток, над ним стрелка вниз, перечёркнуто. */
  shut: '<path d="M4 14h4l1 3h6l1-3h4v6H4z"/><path d="M12 3v8"/><path d="M9 8l3 3 3-3"/><path d="M3 3l18 18"/>',
  /** Мерж закрыт — две стопки, между ними перечёркнутая стрелка. */
  seal: '<rect x="2" y="7" width="7" height="10" rx="1"/><rect x="15" y="7" width="7" height="10" rx="1"/><path d="M10.5 12h3"/><path d="M12 9.5 14 12l-2 2.5"/><path d="M9.5 18.5l5-13"/>',
  /** Индикатор колоды — три карты веером. */
  deck: '<rect x="3" y="4" width="9" height="12" rx="1.5" transform="rotate(-14 7 10)"/><rect x="8" y="4" width="9" height="12" rx="1.5"/><rect x="12" y="4" width="9" height="12" rx="1.5" transform="rotate(14 17 10)"/>',
  "sec-pose": '<rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(-20 12 20)"/><rect x="9" y="5" width="6" height="12" rx="1" transform="rotate(20 12 20)"/><path d="M5 21h14"/>',
  "sec-chair": '<path d="M7 3v9h10V3"/><path d="M6 12h12v3H6z"/><path d="M7 15v6"/><path d="M17 15v6"/>',
  "sec-order": '<path d="M4 6h10"/><path d="M4 12h7"/><path d="M4 18h4"/><path d="M18 5v14"/><path d="M15 16l3 3 3-3"/>',
  "sec-say": '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 10.5h.01"/><path d="M12 10.5h.01"/><path d="M16 10.5h.01"/>',
};
