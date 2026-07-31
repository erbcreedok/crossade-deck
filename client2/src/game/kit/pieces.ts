import type { PieceSpec } from "../ui/pieceKinds";
import { SB_ITEM_GAP } from "../engine/sandboxLayout";
import { wrapRow } from "../engine/sandboxWrap";
import { drawAnchorIcon, drawRingIcon } from "./markerIcons";
import type { Marker } from "../engine/marker";
import type { MarkerLook, Pt, SectionContext, SectionSize } from "./context";

// Ряд НЕ-карточных элементов стола: соло-карта с меткой, фишки номиналов, шахматы, столбик фишек.
//
// Смысл секции — что «элемент стола» ≠ «карта». Фишка и конь ездят тем же драгом, отбрасывают те
// же тени, живут в тех же слоях и носят те же метки; при этом они Draggable и Burnable, но НЕ
// Flippable — и зона «ПЕРЕВОРОТ» это видит, потому что реагирует на СПОСОБНОСТЬ, а не на тип.
//
// Ряд объявлен ДАННЫМИ: добавить элемент — строка в списке, а не ветка в коде. Три вида (card /
// piece / stack) диспетчатся одним циклом ниже.

/** Элемент ряда: что это, какой ширины слот, что подписать и нужна ли метка. */
export interface PieceRowItem {
  caption: string;
  /** Ширина слота — и подписи, и шага x. */
  w: number;
  el: { kind: "card"; id: string; card: string } | { kind: "piece"; id: string; spec: PieceSpec } | { kind: "stack" };
  marker?: MarkerLook & { label: string };
}

/** Столбик одинаковых фишек — сколько их и насколько виден край нижней. */
const PILE_COUNT = 6;
const PILE_STEP = 0.28; // доля радиуса: сдвиг соседней фишки вверх

export function pieceRow(cardW: number, cardH: number): PieceRowItem[] {
  const slotW = cardW * 1.05;
  return [
    { caption: "карта + метка", w: slotW, el: { kind: "card", id: "solo-card", card: "A♠" }, marker: { draw: drawAnchorIcon, show: "away", label: "карта" } },
    { caption: "фишка 5", w: slotW * 0.78, el: { kind: "piece", id: "chip-5", spec: { kind: "chip", color: 0xb23b34, denom: "5" } } },
    { caption: "фишка 25", w: slotW * 0.78, el: { kind: "piece", id: "chip-25", spec: { kind: "chip", color: 0x2f6b34, denom: "25" } } },
    { caption: "фишка 100", w: slotW * 0.78, el: { kind: "piece", id: "chip-100", spec: { kind: "chip", color: 0x24242a, denom: "100" } } },
    { caption: "фишка 500", w: slotW * 0.78, el: { kind: "piece", id: "chip-500", spec: { kind: "chip", color: 0x6c4bb0, denom: "500" } } },
    { caption: "чёрный конь", w: slotW * 0.9, el: { kind: "piece", id: "chess-knight", spec: { kind: "chess", dark: true, glyph: "♞" } }, marker: { draw: drawRingIcon, show: "empty", label: "конь" } },
    { caption: "белая пешка", w: slotW * 0.9, el: { kind: "piece", id: "chess-pawn", spec: { kind: "chess", dark: false, glyph: "♟" } } },
    { caption: "стопка фишек", w: slotW, el: { kind: "stack" } },
  ];
}

/**
 * Вертикальный столбик фишек, который тянут ЦЕЛИКОМ за грип. Тот же host + групповой груз, что у
 * стопки карт, — доказательство, что группировка generic по элементу, а не про карты. Флип пачки
 * не сработает (фишки не Flippable), сжечь — сработает.
 */
export function chipPile(ctx: SectionContext, at: Pt, r: number, idPrefix = "pile"): { ids: string[]; dragger: Marker } {
  const ids: string[] = [];
  for (let i = 0; i < PILE_COUNT; i++) {
    const id = `${idPrefix}-${i}`;
    ctx.piece(id, { x: at.x, y: at.y - i * r * PILE_STEP }, { kind: "chip", color: 0xc79a3e, denom: "" }, r);
    ids.push(id);
  }
  const slot = { x: at.x, y: at.y - ((PILE_COUNT - 1) / 2) * r * PILE_STEP }; // центр столбика
  return { ids, dragger: ctx.pile(ids, slot, { draw: drawAnchorIcon, show: "away" }).dragger };
}

export function piecesSection(ctx: SectionContext, at: Pt): SectionSize & { pile: { ids: string[]; dragger: Marker } | null } {
  const r = ctx.cardH * 0.34; // радиус фишки/подставки
  const items = pieceRow(ctx.cardW, ctx.cardH);

  // Перенос строк: ряд из 8 переполняет узкий экран (390px) — wrapRow пакует по maxWidth, itemH
  // включает высоту карты/фишки плюс подпись под ней.
  const { items: placed, totalH } = wrapRow(items.map((it) => it.w), ctx.cardW * 8, ctx.cardH + 34, SB_ITEM_GAP);
  let width = 0;
  let pile: { ids: string[]; dragger: Marker } | null = null;
  items.forEach((it, i) => {
    const p = placed[i]!;
    const x = at.x + ctx.cardW / 2 + p.x;
    const cy = at.y + p.y + ctx.cardH / 2;
    const home = { x, y: cy };
    if (it.el.kind === "card") ctx.card({ id: it.el.id, card: it.el.card, rest: "idle" }, home, 100);
    else if (it.el.kind === "piece") ctx.piece(it.el.id, home, it.el.spec, r);
    else pile = chipPile(ctx, home, r);
    if (it.marker && it.el.kind !== "stack") ctx.solo(it.el.id, home, { draw: it.marker.draw, show: it.marker.show }, it.marker.label);
    ctx.label(it.caption, x, cy + ctx.cardH / 2 + 8, 12, 0x9aa89f, it.w);
    width = Math.max(width, p.x + it.w);
  });

  return { bottom: at.y + totalH, width: ctx.cardW / 2 + width, pile };
}
