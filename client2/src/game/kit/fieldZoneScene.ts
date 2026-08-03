import { Graphics } from "pixi.js";
import { DropZone } from "../ui/DropZone";
import { FieldZone, type OnOccupied } from "../slotfield/fieldZone";
import { place, type Board } from "../slotfield/slotField";
import { sameColorRule } from "../slotfield/fieldRules";
import type { PieceSpec } from "../ui/pieceKinds";
import { gridSlots, hexSlots, ringSlots, type PositionedSlot } from "../slotfield/layout/slots";
import type { Pt, SectionContext, SectionSize } from "./context";

// ДОСКА — размеченный стол: слоты, в которые фигуры встают, а не лежат где попало.
//
// В движке это `FieldZone` (board/boardZone.ts): состояние доски плюс правила приёма, БЕЗ Pixi.
// Раскладка у неё ПОДКЛЮЧАЕМАЯ — зона получает готовый список позиционированных слотов и про
// стратегию не знает вовсе. Поэтому «шахматы», «монополия» и «карточный планшет» отличаются не
// кодом зоны, а тем, какой список слотов ей дали.
//
// Что видно только руками:
//   • дроп резолвится в СЛОТ, а не в точку: фигура встаёт ровно в клетку, куда бы её ни отпустили;
//   • `onOccupied` решает, что делать с ЗАНЯТОЙ клеткой — и это четыре разные игры: merge (стопка),
//     swap (обмен), capture (взятие, как в шахматах), reject (нельзя);
//   • за рамку доски фигуру не вытащить — `bounds` держит её внутри.

export type BoardLayoutKind = "grid" | "ring" | "hex";

/** Что случилось на дропе. `moved: false` — зона отказала (занято при reject, чужой цвет и т.п.). */
export interface BoardEvent {
  figure: string;
  moved: boolean;
  captured?: string[];
  /** Слот, в который встала фигура; при отказе — тот, где она осталась. */
  slot: string | null;
}

/** Правило приёма поверх `onOccupied` — элемент-слой цепочки (board/boardRules.ts). */
export type BoardRuleKind = "none" | "sameColor";

/** Что СТОИТ на доске. Доска не про шахматы: та же зона держит фишки и карты. */
export type BoardContentKind = "chess" | "chips" | "cards";

export interface FieldSceneOpts {
  layout: BoardLayoutKind;
  /** Чем занять клетки. Правила приёма от этого не зависят — зона про содержимое не знает. */
  content: BoardContentKind;
  cols: number;
  rows: number;
  /** ring: сколько слотов по окружности. */
  ringCount: number;
  onOccupied: OnOccupied;
  rule: BoardRuleKind;
  /**
   * Куда сообщать об исходе дропа. Секция не решает, что с этим делать: каталог отправляет в
   * панель Actions, песочница может логировать, игра — слать на сервер. Без этого исход виден
   * только глазами по картинке, и «почему не встала» приходится угадывать.
   */
  onEvent?: (e: BoardEvent) => void;
  /** Сколько фигур расставить изначально. */
  figures: number;
}

export const FIELD_SCENE_DEFAULTS: FieldSceneOpts = { layout: "grid", content: "chess", cols: 4, rows: 3, ringCount: 10, onOccupied: "swap", rule: "none", figures: 4 };

/** Слоты выбранной раскладки. Обе стратегии — существующие (board/layout/slots.ts), своих тут нет. */
function slotsFor(o: FieldSceneOpts, cell: { w: number; h: number }, at: Pt): PositionedSlot[] {
  const gap = Math.round(cell.w * 0.18);
  if (o.layout === "ring") {
    const radius = cell.w * 1.9;
    return ringSlots(o.ringCount, { cx: at.x + radius + cell.w / 2, cy: at.y + radius + cell.h / 2, radius, cell });
  }
  if (o.layout === "hex") return hexSlots(o.cols, o.rows, { cell, origin: { x: at.x, y: at.y }, gap: Math.round(gap / 2) });
  return gridSlots({ cols: o.cols, cell, gap, origin: { x: at.x, y: at.y } }, o.rows);
}

/** Размер клетки по тому, что в ней стоит: предмет обязан помещаться с полем, а не наоборот. */
function cellFor(ctx: SectionContext, content: BoardContentKind): { w: number; h: number } {
  if (content === "cards") return { w: Math.round(ctx.cardW * 1.18), h: Math.round(ctx.cardH * 1.12) };
  const side = Math.round(ctx.cardW * 0.8);
  return { w: side, h: side };
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
 * Дроп идёт через `FieldZone.dropAt` — ту же дверь, что в игре. Секция ничего не решает сама:
 * куда встанет фигура и что будет с занятой клеткой, отвечает зона.
 */
export function fieldZoneScene(ctx: SectionContext, at: Pt, o: Partial<FieldSceneOpts> = {}, idPrefix = "bz"): SectionSize {
  const opts = { ...FIELD_SCENE_DEFAULTS, ...o };
  // КЛЕТКА СЧИТАЕТСЯ ОТ СОДЕРЖИМОГО, а не от карты (issue #101). Клетка «в карточных долях» —
  // случайность: под фишку она вдвое велика, а под саму карту мала, и предмет вылезал за разметку,
  // из-за чего «встал в слот» становилось неотличимо от «лёг куда попало».
  const cell = cellFor(ctx, opts.content);
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
  slots.forEach((s) => {
    const color = slotDark.get(s.key) ? 0x3f5145 : 0x4d5f52;
    // Клетка рисуется ФОРМОЙ своей раскладки: шестиугольник, нарисованный прямоугольником, врёт о
    // том, сколько у клетки соседей, — а это единственное, ради чего соты и заводят.
    if (opts.layout === "hex") g.poly(hexPoints(s.center.x, s.center.y, s.rect.w / 2)).fill({ color });
    else g.roundRect(s.rect.x, s.rect.y, s.rect.w, s.rect.h, 6).fill({ color });
  });
  ctx.decor(g);

  const ids = Array.from({ length: Math.min(opts.figures, slots.length) }, (_, i) => `${idPrefix}-${i}`);
  const figureDark = new Map(ids.map((id, i) => [id, i % 2 === 0]));
  const board: Board = ids.reduce<Board>((b, id, i) => place(b, slots[i]!.key, { members: [id] }), { slots: {}, onEmpty: "keep" });
  const zone = new FieldZone({
    slots,
    board,
    bounds,
    onOccupied: opts.onOccupied,
    ...(opts.rule === "sameColor" ? { rule: sameColorRule(figureDark, slotDark) } : {}),
  });

  // ЧТО стоит на клетках — параметр. Доска не про шахматы: те же слоты и те же правила держат
  // фишки и карты, и это видно только тогда, когда на них действительно стоит не фигура.
  const r = Math.round(cell.w * 0.34);
  const CHIPS = [0xc0392b, 0x2e8b57, 0x2f4f8f, 0x7d3cc0, 0xc79a3e];
  const CARDS = ["A♠", "K♥", "Q♦", "10♣", "7♠", "9♥"];
  ids.forEach((id, i) => {
    const c = zone.figureHome(id);
    if (opts.content === "cards") {
      ctx.card({ id, card: CARDS[i % CARDS.length]!, pose: "rest" }, { x: c.x, y: c.y }, i);
      return;
    }
    const spec: PieceSpec =
      opts.content === "chips"
        ? { kind: "chip", color: CHIPS[i % CHIPS.length]!, denom: ["5", "25", "100", "500"][i % 4]! }
        : { kind: "chess", dark: figureDark.get(id)!, glyph: ["♞", "♜", "♝", "♛", "♚", "♟"][i % 6]! };
    ctx.piece(id, { x: c.x, y: c.y }, spec, r);
  });

  // Драг обрабатывает движок; нам нужен только момент отпускания — его даёт дроп-зона по рамке
  // доски. Своей логики «куда встать» тут нет: это работа FieldZone.
  ctx.zone(
    new DropZone({ name: "", verb: "", rect: bounds }),
    (payload, at) => {
      // Слот выбирает ПАЛЕЦ, а не тело фигуры: тело едет пружиной и в момент отпускания отстаёт —
      // на занятой клетке оно не доезжало до неё и попадало в зазор между слотами, отчего swap
      // молча не случался. Груз при этом может быть и одиночным, и набором: «куда встать» решает
      // координата отпускания, а не то, за что тянули.
      const el = payload.lead;
      const res = zone.dropAt(el.id, at.x, at.y);
      opts.onEvent?.({ figure: el.id, moved: res.moved, captured: res.captured, slot: zone.locate(el.id)?.key ?? null });
      if (!res.moved) return;
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

/** Шесть точек правильного шестиугольника «плоской вершиной вверх» — форма клетки сот. */
function hexPoints(cx: number, cy: number, r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}
