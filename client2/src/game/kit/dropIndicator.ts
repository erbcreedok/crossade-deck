import { Graphics, Text } from "pixi.js";
import { DRAG_SCALE, PIXEL_FONT } from "../engine/constants";
import { SB_ITEM_GAP } from "../engine/sandboxLayout";
import { fitBox } from "../ui/boxFit";
import type { Pt, SectionContext, SectionSize } from "./context";

// «Дроп-индикатор»: варианты ОФОРМЛЕНИЯ подписи над бордом при наведении — юзер-тест перед выбором
// финального (прямой запрос владельца, issue #39).
//
// REST — подпись лежит НИЖЕ карт борда, как сегодня (скрыта, z surface < idle): это baseline
// проблемы. ACTIVE переносит подпись на слой verb — тот же, что уже несёт «глагол» DropZone.
//
// Отклонение от тикета (по прямому решению владельца, 2026-07-28): тикет просил драг-карту
// (pose:"held" → drag-слой, самый верхний) поверх подписи ВО ВСЕХ пяти, смещённую на +20px. Но
// pose:"held" рисуется в DRAG_SCALE (×1.45) — при 20px карта того же плана целиком накрывает и
// борд, и подпись (проверено скриншотом), а с исправленным сдвигом перекрывает почти всю подпись во
// всех пяти и мешает СРАВНИВАТЬ стили между собой — то, ради чего секция и существует. Поэтому
// драг-карта осталась только в ОДНОМ, шестом слоте — «живой» сценарий с победителем первых пяти
// (HUD-тег); в первых пяти подпись читается целиком, ничем не занавешенная.
//
// Все карты секции драгабл (демо ощущается живее) и ничем не зажаты: эти «борды» — декоративная
// рамка, не FieldZone, границ и не было. Отпущенная карта едет домой пружиной, как любой бесхозный
// элемент, кроме случая, когда её унесли в «СЖЕЧЬ».

const TEXT = "переместить сюда";
const GOLD = 0xf2c14e;
const GRID_COLS = 3;

/** Стиль подписи-индикатора: имя для витрины + как его нарисовать в точке (cx, cy). */
export interface IndicatorStyle {
  /** Ключ стиля. Выбирают ПО НЕМУ, а не по индексу: индекс молча меняется при вставке в середину. */
  id: string;
  name: string;
  paint: (ctx: SectionContext, cx: number, cy: number, text: string) => void;
}

/**
 * Толстая/тонкая обводка вокруг текста, опционально + мягкая тень (blur). Заливка золотая, как у
 * DropZone.verb — та же семья «глагол над картами».
 */
export function paintIndicatorOutline(ctx: SectionContext, cx: number, cy: number, text: string, strokeWidth: number, softShadow = false): void {
  const t = new Text({
    text,
    style: {
      fontFamily: PIXEL_FONT,
      fontSize: 12,
      fill: GOLD,
      align: "center",
      stroke: { color: 0x000000, width: strokeWidth },
      ...(softShadow ? { dropShadow: { color: 0x000000, alpha: 0.5, blur: 3, distance: 1, angle: Math.PI / 4 } } : {}),
    },
  });
  t.anchor.set(0.5);
  t.position.set(cx, cy);
  ctx.decor(t, "verb");
}

/**
 * ЖЁСТКАЯ тень: сплошной чёрный дубль текста со смещением (−2/+2), без blur — не путать с мягким
 * Pixi dropShadow (тот вариант — paintIndicatorOutline(softShadow=true)).
 */
export function paintIndicatorHardShadow(ctx: SectionContext, cx: number, cy: number, text: string): void {
  const shadow = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: 0x000000, align: "center" } });
  shadow.anchor.set(0.5);
  shadow.position.set(cx - 2, cy + 2);
  const main = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: GOLD, align: "center" } });
  main.anchor.set(0.5);
  main.position.set(cx, cy);
  ctx.decor(shadow, "verb");
  ctx.decor(main, "verb");
}

/**
 * Подложка под текстом: badge — нейтральная полупрозрачная плашка; hud — та же плашка с акцентной
 * рамкой и золотым текстом (игровой «шильдик»).
 */
export function paintIndicatorBadge(ctx: SectionContext, cx: number, cy: number, text: string, hud: boolean): void {
  const t = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: hud ? GOLD : 0xe8e8e8, align: "center" } });
  t.anchor.set(0.5);
  t.position.set(cx, cy);
  const pad = 6;
  // Габарит подложки — общей арифметикой (ui/boxFit.ts), а не «плюс два поля» на месте: это та же
  // коробка с текстом, что кнопка и дроп-зона, и считать её тремя способами незачем.
  const box = fitBox({ preset: { w: 0, h: 0 }, text: { w: t.width, h: t.height }, fit: "content", padding: pad });
  const bg = new Graphics();
  bg.roundRect(cx - box.w / 2, cy - box.h / 2, box.w, box.h, 6).fill({ color: 0x1c2620, alpha: hud ? 0.85 : 0.55 });
  if (hud) bg.stroke({ width: 2, color: GOLD });
  ctx.decor(bg, "verb");
  ctx.decor(t, "verb");
}

/** Пять сравниваемых стилей ACTIVE-подписи. Победитель первых пяти — HUD-тег (последний). */
export const INDICATOR_STYLES: readonly IndicatorStyle[] = [
  { id: "outline", name: "оригинал: обводка 3px", paint: (c, cx, cy, t) => paintIndicatorOutline(c, cx, cy, t, 3) },
  { id: "hardShadow", name: "жёсткая тень", paint: (c, cx, cy, t) => paintIndicatorHardShadow(c, cx, cy, t) },
  { id: "badge", name: "badge (подложка)", paint: (c, cx, cy, t) => paintIndicatorBadge(c, cx, cy, t, false) },
  { id: "thinOutline", name: "тонкий контур + тень", paint: (c, cx, cy, t) => paintIndicatorOutline(c, cx, cy, t, 1.5, true) },
  { id: "hudTag", name: "HUD-тег", paint: (c, cx, cy, t) => paintIndicatorBadge(c, cx, cy, t, true) },
];

export function dropIndicatorSection(ctx: SectionContext, at: Pt): SectionSize {
  const cell = { w: ctx.cardW, h: ctx.cardH };
  const dragOffsetX = cell.w * 0.5;
  let depth = 0;

  const cellFrame = (x: number, y: number): void => {
    const g = new Graphics();
    g.roundRect(x, y, cell.w, cell.h, 8).fill({ color: 0x000000, alpha: 0.12 }).stroke({ width: 1, color: 0x4a5b50 });
    ctx.decor(g);
  };
  const boardCard = (id: string, x: number, y: number): void => {
    ctx.card({ id, card: "5♠", pose: "rest" }, { x: x + cell.w / 2, y: y + cell.h / 2 }, depth++);
  };
  const dragCard = (id: string, x: number, y: number): void => {
    ctx.card({ id, card: "K♥", pose: "held" }, { x: x + cell.w / 2 + dragOffsetX, y: y + cell.h / 2 }, depth++);
  };

  // REST: подпись стоит под картой борда — визуально скрыта, ровно как сегодня.
  cellFrame(at.x, at.y);
  boardCard("di-rest", at.x, at.y);
  ctx.label(TEXT, at.x + cell.w / 2, at.y + cell.h / 2 - 7, 12, GOLD, cell.w * 1.4);
  ctx.label("REST (в покое)", at.x + cell.w / 2, at.y + cell.h + 10, 12, 0x9aa89f, cell.w * 1.6);
  const restBottom = at.y + cell.h + 32;

  // Матрица 3×2 (не wrapRow-лента): 6 ячеек — 5 стилей + «живой» слот, фиксированной сеткой
  // строка/столбец, а не построчным переносом по ширине экрана (прямое решение владельца).
  const activeTop = restBottom + 26;
  const plainCellW = cell.w + 16; // запас под подпись, если она чуть шире карты
  const liveCellW = cell.w / 2 + dragOffsetX + (cell.w * DRAG_SCALE) / 2 + 20; // + до правого края увеличенной драг-карты
  const colW = Math.max(plainCellW, liveCellW); // единая ширина колонки — иначе не матрица, а лесенка
  const rowH = cell.h + 40;
  const cellAt = (i: number): Pt => ({
    x: at.x + (i % GRID_COLS) * (colW + SB_ITEM_GAP),
    y: activeTop + Math.floor(i / GRID_COLS) * (rowH + SB_ITEM_GAP),
  });

  INDICATOR_STYLES.forEach((v, i) => {
    const { x, y } = cellAt(i);
    cellFrame(x, y);
    boardCard(`di-active-${i}`, x, y);
    v.paint(ctx, x + cell.w / 2, y + cell.h / 2, TEXT);
    ctx.label(v.name, x + cell.w / 2, y + cell.h + 10, 12, 0x9aa89f, plainCellW * 0.95);
  });

  // Шестая ячейка — «живой» слот: победивший стиль под настоящей драг-картой.
  {
    const { x, y } = cellAt(INDICATOR_STYLES.length);
    cellFrame(x, y);
    boardCard("di-live-board", x, y);
    paintIndicatorBadge(ctx, x + cell.w / 2, y + cell.h / 2, TEXT, true);
    dragCard("di-live-drag", x, y);
    ctx.label("HUD-тег + наведение (реальный сценарий)", x + cell.w / 2, y + cell.h + 10, 12, 0x9aa89f, liveCellW * 0.95);
  }

  const rows = Math.ceil((INDICATOR_STYLES.length + 1) / GRID_COLS);
  const width = GRID_COLS * colW + (GRID_COLS - 1) * SB_ITEM_GAP;
  const bottom = activeTop + rows * rowH + (rows - 1) * SB_ITEM_GAP;
  return { bottom: bottom + 20, width: Math.max(cell.w, width) };
}

export const INDICATOR_STYLE_IDS: string[] = INDICATOR_STYLES.map((s) => s.id);

/** Стиль по ключу. Неизвестный — первый: подпись «переместить сюда» обязана нарисоваться всегда. */
export function indicatorStyle(id: string): IndicatorStyle {
  return INDICATOR_STYLES.find((s) => s.id === id) ?? INDICATOR_STYLES[0]!;
}
