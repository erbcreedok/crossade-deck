import { absolute, grid, linear, pile } from "../slot/layouts";
import { dropTarget, figures, homeOf as leafHomeOf, measure } from "../slot/slot";
import { group, leaf, type Size, type Slot, type Vec } from "../slot/types";
import type { NetTree } from "./netTree";
import type { CrossadeState } from "./state";

// ГЕОМЕТРИЯ СТОЛА CROSSADE — одно дерево слотов (game/slot/) на всё сразу, по образцу
// solitaire/tree.ts: слот и дропзона выводятся из ОДНОГО дерева, а не двух рассинхронизирующихся
// источников (см. предупреждение в solitaire/tree.ts, issue #78).
//
// Доска ФИКСИРОВАННОГО размера (камера подгонит, см. solitaire/tree.ts) — растёт только если своя
// рука или play-зона переросли базовый габарит, ровно как колонка Косынки.
//
// Раскладки — общие (slot/layouts.ts):
//   • колода/сброс/кучка play — pile() с cell-резервом (пустая зона всё равно ловит дроп — сюда
//     и нужно класть первую карту: пустая кучка «новая», пустой сброс после «Перераздачи»);
//   • ряд своей руки, полоса мест игроков — linear() по оси x;
//   • play-зона внутри себя — grid() (переиспользуем ТОЛЬКО .place() для позиций, без обёртки
//     группой: как и в Косынке, кучки — прямые дети корня на absolute()-координатах, а не
//     вложенная дропзона — иначе dropTarget не спустился бы внутрь без caps.drop на каждом
//     промежуточном узле, см. slot/slot.ts#dropTarget).
//
// Места игроков в MVP — только счёт (handCount), без раскладки чужих карт: сами карты чужой руки
// не рисуем. Место игрока — ПУСТАЯ куча (pile() без детей), не лист: dropTarget (slot/slot.ts)
// спускается только в group-детей (см. её же комментарий «Глубочайшая группа-дропзона»), лист
// дропзоной стать не может в принципе — значит место обязано быть группой, даже без единой карты
// внутри. cell у pile() резервирует габарит пустой куче (тот же приём, что у пустого сброса/play-
// кучки). Дропзона — только в лобби (раздача дилера драгом, этап 5 CROSSADE-DESIGN.md): в игре
// caps.drop у места нет вовсе, и dropTarget проходит место насквозь, как обычный пустой прямоугольник.

export const CARD: Size = { w: 100, h: 143 };
export const SEAT: Size = { w: 72, h: 92 };

const GAP = { x: 24, y: 30 };
const MARGIN = { x: 40, y: 30 };

/** Едва заметный стаггер колоды — читается как «толщина», а не как отдельные карты (см. Косынку). */
const DECK_STAGGER = 0.45;
/** Стаггер кучки play-зоны — крупнее колодного: видно, что в кучке больше одной карты. */
const PLAY_STAGGER = 6;

/** Базовая ширина play-грида в колонках (ряд кучек до переноса на вторую строку). */
const PLAY_COLS = 4;
/** На сколько рядов кучек рассчитана доска в покое — длиннее просто переносится, доска растёт. */
const PLAY_ROWS_FIT = 2;

const SEATS_Y = MARGIN.y;
const MAIN_ROW_Y = SEATS_Y + SEAT.h + GAP.y;

const PLAY_AREA_W = PLAY_COLS * CARD.w + (PLAY_COLS - 1) * GAP.x;
const PLAY_AREA_H = PLAY_ROWS_FIT * CARD.h + (PLAY_ROWS_FIT - 1) * GAP.y;

/** Габарит доски в покое — от него камера считает вписывание (см. Косынку). */
export const BOARD_W = MARGIN.x * 2 + CARD.w + GAP.x + PLAY_AREA_W + GAP.x + CARD.w;
export const BOARD_H = MAIN_ROW_Y + PLAY_AREA_H + GAP.y + CARD.h + MARGIN.y;

const PLAY_ORIGIN: Vec = { x: MARGIN.x + CARD.w + GAP.x, y: MAIN_ROW_Y };
const DISCARD_ORIGIN: Vec = { x: BOARD_W - MARGIN.x - CARD.w, y: MAIN_ROW_Y };
const HAND_ROW_Y = MAIN_ROW_Y + PLAY_AREA_H + GAP.y;

/** Слот колоды: по центру стола в лобби (единственный объект на столе), слева — когда «ГОУ!» открыл
 *  доску и делить место приходится со сбросом/play-зоной. Единственное место, где фаза решает позицию. */
function deckOrigin(phase: CrossadeState["phase"]): Vec {
  if (phase === "lobby") return { x: BOARD_W / 2 - CARD.w / 2, y: MAIN_ROW_Y };
  return { x: MARGIN.x, y: MAIN_ROW_Y };
}

interface Placed {
  id: string;
  origin: Vec;
  slot: Slot;
}

function deckSlot(state: CrossadeState): Placed {
  return {
    id: "deck",
    origin: deckOrigin(state.phase),
    slot: group("deck", pile({ dx: DECK_STAGGER, dy: DECK_STAGGER, cell: CARD }), state.deck.map((c) => leaf(c, c, CARD))),
  };
}

function discardSlot(state: CrossadeState): Placed {
  return {
    id: "discard",
    origin: DISCARD_ORIGIN,
    slot: group("discard", pile({ dx: 0, dy: 0, cell: CARD }), state.discard.map((c) => leaf(c, c, CARD)), { drop: { accept: () => true } }),
  };
}

/** Кучки play-зоны + ВСЕГДА один пустой слот «новая кучка» в конце (см. CROSSADE-DESIGN.md).
 *  Common зона: любой игрок кладёт в любую кучку — легальность проверяет сервер, клиент принимает всё. */
function playSlots(state: CrossadeState): Placed[] {
  const stackIds = [...state.play.map((_, i) => `play:${i}`), "play:new"];
  const layout = grid({ cell: CARD, cols: { min: PLAY_COLS }, gap: GAP.x });
  const { at } = layout.place(stackIds.map(() => CARD));

  return stackIds.map((id, i) => {
    const cards = state.play[i] ?? []; // последний id ("play:new") всегда пуст — резерва в state.play нет
    return {
      id,
      origin: { x: PLAY_ORIGIN.x + at[i]!.x, y: PLAY_ORIGIN.y + at[i]!.y },
      slot: group(id, pile({ dx: PLAY_STAGGER, dy: PLAY_STAGGER, cell: CARD }), cards.map((c) => leaf(c, c, CARD)), {
        drop: { accept: () => true },
      }),
    };
  });
}

// Позиции ВНУТРИ "hand" считает её собственная linear()-раскладка (slot/slot.ts#childAt прогоняет
// group.layout.place() при чтении) — здесь нужен только origin группы на доске.
function handSlot(state: CrossadeState): Placed {
  return {
    id: "hand",
    origin: { x: MARGIN.x, y: HAND_ROW_Y },
    slot: group(
      "hand",
      linear({ axis: "x", gap: GAP.x }),
      state.selfHand.map((c) => leaf(c, c, CARD)),
      { drop: { accept: () => true }, reorder: { enabled: true } },
    ),
  };
}

/** Полоса мест игроков — только счёт (handCount), без раскладки чужих карт (см. заголовок файла).
 *  В лобби каждое место — дропзона: дилер тащит верхнюю карту колоды на любое место (в т.ч. своё
 *  же — «сдать себе»), accept пропускает всё, легальность (isReady/isDealer) проверяет сервер. */
function seatSlots(state: CrossadeState): Placed[] {
  const layout = linear({ axis: "x", gap: GAP.x });
  const { at } = layout.place(state.seats.map(() => SEAT));
  const dealDropCaps = state.phase === "lobby" ? { drop: { accept: () => true } } : undefined;
  return state.seats.map((seat, i) => ({
    id: `seat:${seat.sessionId}`,
    origin: { x: MARGIN.x + at[i]!.x, y: SEATS_Y + at[i]!.y },
    slot: group(`seat:${seat.sessionId}`, pile({ dx: 0, dy: 0, cell: SEAT }), [], dealDropCaps),
  }));
}

/** Дерево этого стола — общий контракт сетевого стола (netTree.ts), своей формы у него нет. */
export type CrossadeTree = NetTree;

/** Построить дерево под ТЕКУЩИЙ снимок стола. Дерево — вид состояния, а не второй источник правды:
 *  любое изменение снимка пересобирает его целиком (дёшево — карт немного, слотов ещё меньше). */
export function buildCrossadeTree(state: CrossadeState): CrossadeTree {
  const placed: Placed[] = [deckSlot(state), discardSlot(state), ...playSlots(state), handSlot(state), ...seatSlots(state)];

  const root = group(
    "cro-root",
    absolute(placed.map((p) => p.origin)),
    placed.map((p) => p.slot),
  );

  const origins: Record<string, Vec> = {};
  const slotIndex = new Map<string, string>();
  placed.forEach((p) => {
    origins[p.id] = p.origin;
    figures(p.slot).forEach((cardId) => slotIndex.set(cardId, p.id));
  });

  const measured = measure(root);
  const size = { w: Math.max(BOARD_W, measured.w), h: Math.max(BOARD_H, measured.h) };

  return {
    root,
    size,
    origins,
    homeOf: (cardId) => leafHomeOf(root, cardId),
    slotOf: (cardId) => slotIndex.get(cardId) ?? null,
    slotAt: (cp) => dropTarget(root, cp)?.group.id ?? null,
  };
}
