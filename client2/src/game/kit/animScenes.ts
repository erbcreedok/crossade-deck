import { Graphics } from "pixi.js";
import { Button } from "../ui/Button";
import type { Card } from "../ui/Card";
import type { Piece } from "../ui/Piece";
import type { AnimPreset } from "../anim/presets";
import type { Pt, SectionContext, SectionSize } from "./context";

// СЦЕНЫ АНИМАЦИЙ — не «стопка и кнопки», а конкретные события стола.
//
// Стопка была удобным подопытным, но она одна ничего не доказывает: анимации живут у ЭЛЕМЕНТА, а
// элементов у нас три вида, и события с ними разные. Одиночная карта, брошенная фишка и взятие в
// шахматах — три разных сценария, и каждый вскрывает своё:
//   • карта   — что все четыре канала (появление, перемещение, переворот, уничтожение) работают на
//               ОДНОМ элементе, а не только на пачке;
//   • фишка   — что реестр общий: фишка не «упрощённый элемент», у неё те же стили;
//   • взятие  — что из стилей СОБИРАЮТСЯ сценарии: съесть = переместить одного + уничтожить другого,
//               и ни одной новой анимации для этого писать не надо.

const ROW_GAP = 14;

/** Ряд кнопок под сценой. Возвращает низ и ширину — мерить их вызывающему нечем. */
function buttonRow(ctx: SectionContext, at: Pt, y: number, defs: ReadonlyArray<{ label: string; variant?: "secondary" | "danger" | "ghost"; run: () => void }>): SectionSize {
  let x = at.x;
  let h = 0;
  for (const d of defs) {
    const b = new Button({ label: d.label, variant: d.variant ?? "secondary", size: "sm", onClick: d.run });
    ctx.button(b, { x: x + b.w / 2, y });
    x += b.w + ROW_GAP;
    h = Math.max(h, b.h);
  }
  return { bottom: y + h / 2, width: x - at.x - ROW_GAP };
}

/**
 * ОДНА карта и все четыре канала на ней. Именно одна: пачка прячет то, что видно только на
 * одиночке — например, что перемещение и переворот это разные анимации, а не одна.
 */
export function singleCardScene(ctx: SectionContext, at: Pt, preset: AnimPreset, id = "solo"): SectionSize {
  const home = { x: at.x + ctx.cardW / 2, y: at.y + ctx.cardH / 2 };
  const away = { x: at.x + ctx.cardW * 3.2, y: at.y + ctx.cardH * 0.35 };
  ctx.card({ id, card: "A♠", pose: "rest" }, home, 0);
  ctx.setAnimPreset([id], preset);

  let out = false;
  const r = buttonRow(ctx, { x: at.x, y: 0 }, at.y + ctx.cardH + 34, [
    { label: "появиться", variant: "ghost", run: () => ctx.appear([id]) },
    {
      label: "переместить",
      // Через ПОРТ КОМАНД, а не прямой мутацией тела: стиль перемещения выбирает пресет, и обходя
      // дверь мы показали бы движение, которого в игре не бывает.
      run: () => {
        const to = out ? home : away;
        out = !out;
        ctx.dispatch({ t: "move", id, x: to.x, y: to.y });
      },
    },
    { label: "перевернуть", run: () => ctx.dispatch({ t: "flip", id }) },
    { label: "уничтожить", variant: "danger", run: () => void (ctx.element(id) as Card | undefined)?.burn?.() },
  ]);
  return { bottom: r.bottom + 10, width: Math.max(r.width, away.x - at.x + ctx.cardW / 2) };
}

/**
 * Фишка, брошенная на стол. Тот же реестр появления, что у карты, — стиль `slam` просто описывает
 * падение с ударом. Отдельного «эффекта фишки» в движке нет и заводить его не потребовалось.
 */
export function chipDropScene(ctx: SectionContext, at: Pt, preset: AnimPreset, id = "chip"): SectionSize {
  const r = ctx.cardH * 0.3;
  const home = { x: at.x + r, y: at.y + r };
  ctx.piece(id, home, { kind: "chip", color: 0xc79a3e, denom: "25" }, r);
  ctx.setAnimPreset([id], preset);

  const row = buttonRow(ctx, { x: at.x, y: 0 }, at.y + r * 2 + 30, [
    { label: "бросить", variant: "ghost", run: () => ctx.appear([id]) },
    { label: "уничтожить", variant: "danger", run: () => void (ctx.element(id) as Piece | undefined)?.burn?.() },
  ]);
  return { bottom: row.bottom + 10, width: Math.max(row.width, r * 2) };
}

/** Клетчатая доска — просто фон, ни во что не кликается. */
function board(ctx: SectionContext, at: Pt, cell: number, n: number): void {
  const g = new Graphics();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      g.rect(at.x + c * cell, at.y + r * cell, cell, cell).fill({ color: (r + c) % 2 === 0 ? 0x6b7f6f : 0x3c4b41 });
    }
  }
  ctx.decor(g);
}

/**
 * ВЗЯТИЕ: конь идёт на клетку пешки и снимает её.
 *
 * Главное здесь не шахматы, а то, что это СЦЕНАРИЙ, собранный из готовых кусков: перемещение
 * одного элемента плюс уничтожение другого, с задержкой между ними. Ни одной новой анимации не
 * написано — «съесть» получилось из того, что уже есть.
 *
 * Задержка не косметическая: снять пешку в момент команды — значит показать, что она исчезла ДО
 * того, как конь до неё дошёл. Порядок событий тут и есть смысл хода.
 */
export function chessCaptureScene(ctx: SectionContext, at: Pt, preset: AnimPreset, prefix = "ch"): SectionSize {
  const cell = ctx.cardH * 0.42;
  const N = 4;
  board(ctx, at, cell, N);

  const sq = (c: number, r: number) => ({ x: at.x + c * cell + cell / 2, y: at.y + r * cell + cell / 2 });
  const rad = cell * 0.36;
  const knightHome = sq(0, 3);
  const preyHome = sq(1, 1); // ход конём: две клетки вверх, одна вбок

  const knight = `${prefix}-knight`;
  const prey = `${prefix}-pawn`;
  ctx.piece(knight, knightHome, { kind: "chess", dark: true, glyph: "♞" }, rad);
  ctx.piece(prey, preyHome, { kind: "chess", dark: false, glyph: "♟" }, rad);
  ctx.setAnimPreset([knight, prey], preset);

  let taken = false;
  const row = buttonRow(ctx, { x: at.x, y: 0 }, at.y + N * cell + 30, [
    {
      label: "съесть",
      variant: "danger",
      run: () => {
        if (taken) return;
        taken = true;
        ctx.dispatch({ t: "move", id: knight, x: preyHome.x, y: preyHome.y });
        // Пешка снимается ПОСЛЕ прихода коня. Момент берём из длительности стиля перемещения —
        // прибить его константой значило бы, что при смене стиля порядок событий развалится.
        ctx.after(ctx.moveDuration(knight), () => {
          (ctx.element(prey) as Piece | undefined)?.burn?.();
          ctx.wake();
        });
      },
    },
    {
      label: "заново",
      variant: "ghost",
      run: () => {
        taken = false;
        ctx.dispatch({ t: "move", id: knight, x: knightHome.x, y: knightHome.y });
        ctx.appear([prey]); // мёртвую пешку витрина соберёт заново из её спеки
      },
    },
  ]);
  return { bottom: row.bottom + 10, width: Math.max(row.width, N * cell) };
}
