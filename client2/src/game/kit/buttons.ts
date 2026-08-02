import { Button, type ButtonOptions } from "../ui/Button";
import type { Pt, SectionContext, SectionSize } from "./context";

// Витрина кнопок: варианты, размеры, состояние «недоступна» — рядами с подписями.
//
// Ряды — ДАННЫЕ, а не три похожих вызова: список внизу и есть весь предмет секции, и добавление
// нового варианта Button не должно требовать правки раскладки.

export interface ButtonShowcaseItem {
  cap: string;
  b: Button;
}

const ROW_GAP = 26; // между кнопками в ряду
const CAP_GAP = 8; // кнопка → подпись под ней
const ROW_BOTTOM = 42; // подпись + отступ до следующего ряда

/** Ряды витрины как данные: подпись = имя варианта, по нему же кнопку ищет e2e. */
export const BUTTON_ROWS: ReadonlyArray<ReadonlyArray<{ opts: ButtonOptions; cap: string }>> = [
  [
    { opts: { label: "Основная", variant: "primary" }, cap: "primary" },
    { opts: { label: "Вторичная", variant: "secondary" }, cap: "secondary" },
    { opts: { label: "Опасно", variant: "danger" }, cap: "danger" },
    { opts: { label: "Призрак", variant: "ghost" }, cap: "ghost" },
  ],
  [
    { opts: { label: "Мелкая", size: "sm" }, cap: "sm" },
    { opts: { label: "Средняя", size: "md" }, cap: "md" },
    { opts: { label: "Крупная", size: "lg" }, cap: "lg" },
  ],
  [{ opts: { label: "Недоступна", disabled: true }, cap: "disabled" }],
];

/** Один ряд кнопок с подписями. Возвращает низ ряда, его ширину и сами кнопки (для хуков). */
export function buttonRow(
  ctx: SectionContext,
  at: Pt,
  items: ReadonlyArray<{ opts: ButtonOptions; cap: string }>,
  onEvent?: (e: ButtonEvent) => void,
): SectionSize & { made: ButtonShowcaseItem[] } {
  const made = items.map((it) => ({ b: new Button(report(it.opts, onEvent)), cap: it.cap }));
  const rowH = Math.max(...made.map((m) => m.b.h));
  let x = at.x;
  for (const { b, cap } of made) {
    const cx = x + b.w / 2;
    ctx.button(b, { x: cx, y: at.y + rowH / 2 });
    ctx.label(cap, cx, at.y + rowH + CAP_GAP, 13, 0x9aa89f);
    x += b.w + ROW_GAP;
  }
  return { bottom: at.y + rowH + ROW_BOTTOM, width: x - at.x - ROW_GAP, made };
}

/**
 * Что кнопка СДЕЛАЛА. Нажатие — единственный её исход, и панель Actions существует ровно для того,
 * чтобы он был виден: отключённая кнопка молчит, и это видно там же, а не только на глаз.
 */
export interface ButtonEvent {
  label: string;
  variant: string;
  disabled: boolean;
}

/** Обернуть `onClick`, не тронув остальное: кнопка про панель каталога знать не должна. */
function report(o: ButtonOptions, onEvent?: (e: ButtonEvent) => void): ButtonOptions {
  if (!onEvent) return o;
  return {
    ...o,
    onClick: () => {
      onEvent({ label: o.label ?? "", variant: o.variant ?? "primary", disabled: Boolean(o.disabled) });
      o.onClick?.();
    },
  };
}

/** Секция «Кнопки». showcase — плоский список всех кнопок витрины для e2e-хука хозяина. */
export function buttonsSection(ctx: SectionContext, at: Pt, onEvent?: (e: ButtonEvent) => void): SectionSize & { showcase: ButtonShowcaseItem[] } {
  let y = at.y;
  let width = 0;
  const showcase: ButtonShowcaseItem[] = [];
  for (const items of BUTTON_ROWS) {
    const r = buttonRow(ctx, { x: at.x, y }, items, onEvent);
    y = r.bottom;
    width = Math.max(width, r.width);
    showcase.push(...r.made);
  }
  return { bottom: y, width, showcase };
}
