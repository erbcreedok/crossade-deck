import { Graphics } from "pixi.js";
import { DropZone } from "../ui/DropZone";
import { BoardZone, type OnOccupied } from "../board/boardZone";
import { place, type Board } from "../board/board";
import { sameColorRule } from "../board/boardRules";
import { gridSlots, ringSlots, type PositionedSlot } from "../board/layout/slots";
import type { Pt, SectionContext, SectionSize } from "./context";

// ДОСКА — размеченный стол: слоты, в которые фигуры встают, а не лежат где попало.
//
// В движке это `BoardZone` (board/boardZone.ts): состояние доски плюс правила приёма, БЕЗ Pixi.
// Раскладка у неё ПОДКЛЮЧАЕМАЯ — зона получает готовый список позиционированных слотов и про
// стратегию не знает вовсе. Поэтому «шахматы», «монополия» и «карточный планшет» отличаются не
// кодом зоны, а тем, какой список слотов ей дали.
//
// Что видно только руками:
//   • дроп резолвится в СЛОТ, а не в точку: фигура встаёт ровно в клетку, куда бы её ни отпустили;
//   • `onOccupied` решает, что делать с ЗАНЯТОЙ клеткой — и это четыре разные игры: merge (стопка),
//     swap (обмен), capture (взятие, как в шахматах), reject (нельзя);
//   • за рамку доски фигуру не вытащить — `bounds` держит её внутри.

export type BoardLayoutKind = "grid" | "ring";

/** Правило приёма поверх `onOccupied` — элемент-слой цепочки (board/boardRules.ts). */
export type BoardRuleKind = "none" | "sameColor";

export interface BoardSceneOpts {
  layout: BoardLayoutKind;
  cols: number;
  rows: number;
  /** ring: сколько слотов по окружности. */
  ringCount: number;
  onOccupied: OnOccupied;
  rule: BoardRuleKind;
  /** Сколько фигур расставить изначально. */
  figures: number;
}

export const BOARD_SCENE_DEFAULTS: BoardSceneOpts = { layout: "grid", cols: 4, rows: 3, ringCount: 10, onOccupied: "swap", rule: "none", figures: 4 };

/** Слоты выбранной раскладки. Обе стратегии — существующие (board/layout/slots.ts), своих тут нет. */
function slotsFor(o: BoardSceneOpts, cell: { w: number; h: number }, at: Pt): PositionedSlot[] {
  const gap = Math.round(cell.w * 0.18);
  if (o.layout === "ring") {
    const radius = cell.w * 1.9;
    return ringSlots(o.ringCount, { cx: at.x + radius + cell.w / 2, cy: at.y + radius + cell.h / 2, radius, cell });
  }
  return gridSlots({ cols: o.cols, cell, gap, origin: { x: at.x, y: at.y } }, o.rows);
}

/** Рамка доски по слотам — её же зона использует как `bounds`. */
function boundsOf(slots: readonly PositionedSlot[], pad: number) {
  const x0 = Math.min(...slots.map((s) => s.rect.x)) - pad;
  const y0 = Math.min(...slots.map((s) => s.rect.y)) - pad;
  const x1 = Math.max(...slots.map((s) => s.rect.x + s.rect.w)) + pad;
  const y1 = Math.max(...slots.map((s) => s.rect.y + s.rect.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Витрина доски: слоты нарисованы, фигуры расставлены и перетаскиваются между клетками.
 *
 * Дроп идёт через `BoardZone.dropAt` — ту же дверь, что в игре. Секция ничего не решает сама:
 * куда встанет фигура и что будет с занятой клеткой, отвечает зона.
 */
export function boardZoneScene(ctx: SectionContext, at: Pt, o: Partial<BoardSceneOpts> = {}, idPrefix = "bz"): SectionSize {
  const opts = { ...BOARD_SCENE_DEFAULTS, ...o };
  const cell = { w: Math.round(ctx.cardW * 0.8), h: Math.round(ctx.cardW * 0.8) };
  const slots = slotsFor(opts, cell, at);
  const bounds = boundsOf(slots, Math.round(cell.w * 0.15));

  // Цвет клетки считается ОДИН раз и служит сразу двум: разметке и правилу приёма. Посчитай его
  // правило само — картинка и правило разошлись бы при первой же смене раскладки, и витрина
  // показывала бы одно, а зона делала другое.
  const slotDark = new Map(slots.map((s, i) => [s.key, opts.layout === "grid" ? (Math.floor(i / opts.cols) + (i % opts.cols)) % 2 === 0 : i % 2 === 0]));

  // Разметка — декор: в неё не кликают, она только показывает, где клетки.
  const g = new Graphics();
  g.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, 10).fill({ color: 0x2a352d });
  // Шахматная раскраска для grid и ровные ячейки для ring — разметка обязана читаться как СЕТКА,
  // иначе «встал в слот» неотличимо от «встал куда попало».
  slots.forEach((s) => g.roundRect(s.rect.x, s.rect.y, s.rect.w, s.rect.h, 6).fill({ color: slotDark.get(s.key) ? 0x3f5145 : 0x4d5f52 }));
  ctx.decor(g);

  const ids = Array.from({ length: Math.min(opts.figures, slots.length) }, (_, i) => `${idPrefix}-${i}`);
  const figureDark = new Map(ids.map((id, i) => [id, i % 2 === 0]));
  const board: Board = ids.reduce<Board>((b, id, i) => place(b, slots[i]!.key, { members: [id] }), { slots: {}, onEmpty: "keep" });
  const zone = new BoardZone({
    slots,
    board,
    bounds,
    onOccupied: opts.onOccupied,
    ...(opts.rule === "sameColor" ? { rule: sameColorRule(figureDark, slotDark) } : {}),
  });

  const r = Math.round(cell.w * 0.34);
  ids.forEach((id) => {
    const c = zone.figureHome(id);
    ctx.piece(id, { x: c.x, y: c.y }, { kind: "chess", dark: figureDark.get(id)!, glyph: ["♞", "♜", "♝", "♛", "♚", "♟"][ids.indexOf(id) % 6]! }, r);
  });

  // Драг обрабатывает движок; нам нужен только момент отпускания — его даёт дроп-зона по рамке
  // доски. Своей логики «куда встать» тут нет: это работа BoardZone.
  ctx.zone(
    new DropZone({ name: "", verb: "", rect: bounds }),
    (payload, at) => {
      // Слот выбирает ПАЛЕЦ, а не тело фигуры: тело едет пружиной и в момент отпускания отстаёт —
      // на занятой клетке оно не доезжало до неё и попадало в зазор между слотами, отчего swap
      // молча не случался. Груз при этом может быть и одиночным, и набором: «куда встать» решает
      // координата отпускания, а не то, за что тянули.
      const el = payload.lead;
      if (!zone.dropAt(el.id, at.x, at.y).moved) return;
      // Разъехаться могли многие: swap меняет двоих местами, capture уводит вытесненного.
      for (const id of ids) {
        const p = zone.figureHome(id);
        ctx.dispatch({ t: "move", id, x: p.x, y: p.y });
      }
      ctx.wake();
    },
    () => true,
  );

  return { bottom: bounds.y + bounds.h, width: bounds.x + bounds.w - at.x };
}
