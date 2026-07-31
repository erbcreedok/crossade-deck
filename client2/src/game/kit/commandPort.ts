import { Graphics } from "pixi.js";
import { Button } from "../ui/Button";
import type { CardOptions } from "../ui/Card";
import { fitBlock, SB_ITEM_GAP } from "../engine/sandboxLayout";
import type { Pt, SectionContext, SectionSize } from "./context";

// ПОРТ КОМАНД — то, чем СЕРВЕР, консоль или скрытая логика двигают карты, минуя пальцы игрока.
//
// Раздел показывает именно эту дверь (ctx.dispatch → engine/command.ts, см. CONTROL-DESIGN.md), а не
// прямые сеттеры компонента. Разница принципиальна: все действия обязаны проходить через один
// choke-point, иначе undo, сеть и синхронизация не смогут ничего перехватить. Демонстрировать обход
// этой двери каталог не должен — это учило бы делать неправильно.
//
// Карты раздела не драгабельны (ctx.apiCard): их двигает команда, а не палец. Движение при этом —
// та же пружина, что при драге, поэтому «долетело» и «телепортировалось» видно глазами.

/** Готовый блок раздела: своя рамка, кнопка-подпись и карта(ы) под ней. */
export interface CommandBlock extends SectionSize {
  /** Кнопка блока — хозяину для e2e-хука (у канваса нет ни узлов, ни ролей). */
  button: { cap: string; b: Button };
}

function blockFrame(ctx: SectionContext, at: Pt, w: number, h: number): void {
  const g = new Graphics();
  g.roundRect(at.x, at.y, w, h, 12).fill({ color: 0x000000, alpha: 0.1 }).stroke({ width: 1, color: 0x4a5b50 });
  ctx.decor(g);
}

/** Каркас блока «кнопка + одна карта»: рамка по контенту, кнопка сверху, карта под ней. */
function singleCardBlock(ctx: SectionContext, at: Pt, cap: string, onClick: () => void, cardOpts: CardOptions): CommandBlock {
  const b = new Button({ label: cap, variant: "text", onClick });
  const box = fitBlock(b.w, ctx.cardW, b.h, ctx.cardH);
  blockFrame(ctx, at, box.boxW, box.boxH);
  const cx = at.x + box.boxW / 2;
  ctx.button(b, { x: cx, y: at.y + box.btnCY });
  ctx.apiCard({ ...cardOpts, rest: "idle" }, { x: cx, y: at.y + box.cardCY });
  return { bottom: at.y + box.boxH, width: box.boxW, button: { cap, b } };
}

/** Перевернуть карту командой. Переворот — настоящий, той же анимацией, что при жесте. */
export function flipBlock(ctx: SectionContext, at: Pt, id = "ctl-flip"): CommandBlock {
  return singleCardBlock(ctx, at, "перевернуть карту", () => ctx.dispatch({ t: "flip", id }), { id, card: "A♥" });
}

/**
 * Раскрыть / скрыть: карта в РЕЖИМЕ секретности (живая «пыль»). Тап снимает и ставит скрытость
 * командой — под пылью всё это время лежит настоящее значение, и раскрытая карта показывает его.
 */
export function concealBlock(ctx: SectionContext, at: Pt, id = "ctl-conceal"): CommandBlock {
  let concealed = true;
  return singleCardBlock(ctx, at, "раскрыть / скрыть", () => ctx.dispatch({ t: "conceal", id, v: (concealed = !concealed) }), { id, card: "K♠", hidden: true });
}

/**
 * Раскрытие ЗНАЧЕНИЯ — другая история, чем скрытость. Здесь значения нет вовсе (card: ""), карта
 * маскируется, и команда его ПРОСТАВЛЯЕТ: так выглядит «сервер раскрыл придержанное».
 */
export function revealBlock(ctx: SectionContext, at: Pt, id = "ctl-reveal"): CommandBlock {
  let known = false;
  return singleCardBlock(ctx, at, "узнать значение", () => ctx.dispatch({ t: "setValue", id, value: (known = !known) ? "Q♦" : "" }), { id, card: "" });
}

/**
 * Перенос из стопки в стопку одной командой move: случайная карта улетает и остаётся там,
 * следующий тап — обратно. Пружина та же, что при драге: телепорта тут быть не должно.
 */
export function moveBlock(ctx: SectionContext, at: Pt, idPrefix = "s"): CommandBlock & { state: { a: string[]; b: string[] } } {
  const step = ctx.cardW * 0.4;
  const footprint = ctx.cardW + 4 * step; // до 5 карт внахлёст
  const stacksGap = ctx.cardW * 0.7;
  const stacksW = footprint * 2 + stacksGap;
  const cap = "перенос из стопки в стопку";

  const a = ["6♣", "7♣", "8♣", "9♣", "10♣"].map((_, i) => `${idPrefix}a${i}`);
  const b = ["6♦", "7♦", "8♦", "9♦"].map((_, i) => `${idPrefix}b${i}`);
  const state = { a, b, toB: true };

  const relayout = (ids: string[], originX: number, y: number): void => {
    ids.forEach((id, i) => ctx.dispatch({ t: "move", id, x: originX + ctx.cardW / 2 + i * step, y }));
  };

  const btn = new Button({
    label: cap,
    variant: "text",
    onClick: () => {
      const [from, to, fromX, toX] = state.toB ? [state.a, state.b, ax, bx] : [state.b, state.a, bx, ax];
      if (from.length > 0) {
        const [id] = from.splice(Math.floor(Math.random() * from.length), 1); // случайная карта
        to.push(id!); // ложится сверху (правее)
        relayout(from, fromX, cardY);
        relayout(to, toX, cardY);
      }
      state.toB = !state.toB; // следующий тап — в обратную сторону
    },
  });
  const box = fitBlock(btn.w, stacksW, btn.h, ctx.cardH);
  blockFrame(ctx, at, box.boxW, box.boxH);
  const cx = at.x + box.boxW / 2;
  ctx.button(btn, { x: cx, y: at.y + box.btnCY });
  const cardY = at.y + box.cardCY;
  const groupLeft = at.x + (box.boxW - stacksW) / 2; // группа стопок по центру блока
  const ax = groupLeft;
  const bx = groupLeft + footprint + stacksGap;
  ["6♣", "7♣", "8♣", "9♣", "10♣"].forEach((face, i) => ctx.apiCard({ id: a[i]!, card: face }, { x: ax + ctx.cardW / 2 + i * step, y: cardY }));
  ["6♦", "7♦", "8♦", "9♦"].forEach((face, i) => ctx.apiCard({ id: b[i]!, card: face }, { x: bx + ctx.cardW / 2 + i * step, y: cardY }));

  return { bottom: at.y + box.boxH, width: box.boxW, button: { cap, b: btn }, state };
}

/** Все командные блоки подряд. Витрина виджетов идёт отдельной секцией (kit/widgets.ts). */
export function commandPortSection(
  ctx: SectionContext,
  at: Pt,
): SectionSize & { buttons: { cap: string; b: Button }[]; move: { a: string[]; b: string[] } } {
  let y = at.y;
  let width = 0;
  const buttons: { cap: string; b: Button }[] = [];
  const step = (r: CommandBlock) => {
    buttons.push(r.button);
    y = r.bottom + SB_ITEM_GAP;
    width = Math.max(width, r.width);
  };
  step(flipBlock(ctx, { x: at.x, y }));
  step(concealBlock(ctx, { x: at.x, y }));
  step(revealBlock(ctx, { x: at.x, y }));
  const mv = moveBlock(ctx, { x: at.x, y });
  step(mv);
  // Состав стопок переноса отдаём наружу: хук «сколько где карт» — это состояние ДЕМО, а не
  // компонента, и держать его должен хозяин.
  return { bottom: y - SB_ITEM_GAP, width, buttons, move: mv.state };
}
