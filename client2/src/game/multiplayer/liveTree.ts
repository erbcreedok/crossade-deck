import { absolute, grid, linear, pile } from "../slot/layouts";
import { dropTarget, figures, homeOf as leafHomeOf, measure } from "../slot/slot";
import { group, leaf, type Group, type Size, type Slot, type Vec } from "../slot/types";
import { CARD } from "../crossade/tree";
import type { CrossadeState } from "../crossade/state";
import type { MultiplayerTree } from "./tree";

// ГЕОМЕТРИЯ LIVE-СТОЛА — сцена у всех ОДНА с личной перспективой (MULTIPLAYER-DESIGN.md, Live):
// публичные зоны (play-грид + сброс) стоят на ОДИНАКОВЫХ координатах у каждого зрителя — только
// поэтому канал жестов может слать координаты доски как есть. Личное — сверху и снизу: ряды
// РУБАШЕК остальных игроков (alias-id, порядок владельца) и своя рука.
//
// Отдельное дерево, а не флаги в multiplayer/tree.ts: у базового стола и live-стола разные
// инварианты (базовый не обязан держать публичные зоны на фиксированных местах), и один файл с
// ветвлениями охранял бы оба хуже, чем два прямых.

/** Рубашка чужой руки — мельче стольной карты: ряд из 6+ штук должен умещаться в полосе мест. */
export const LIVE_SEAT_CARD: Size = { w: 58, h: 83 };
/** Нахлёст рубашек в ряду чужой руки. */
const SEAT_CARD_DX = 26;
/** Ширина места: имя + ряд рубашек размера руки, с запасом на десять карт. */
export const LIVE_SEAT: Size = { w: SEAT_CARD_DX * 9 + LIVE_SEAT_CARD.w, h: LIVE_SEAT_CARD.h + 22 };

const GAP = { x: 24, y: 30 };
const MARGIN = { x: 40, y: 30 };

const PLAY_STAGGER = 6;
const PLAY_COLS = 4;
const PLAY_ROWS_FIT = 2;

const SEATS_Y = MARGIN.y;
/** Полоса мест ФИКСИРОВАННОЙ высоты: ниже неё начинаются публичные зоны, и их координаты обязаны
 *  совпадать у всех зрителей независимо от числа игроков сверху. */
const PLAY_Y = SEATS_Y + LIVE_SEAT.h + GAP.y;

const PLAY_AREA_W = PLAY_COLS * CARD.w + (PLAY_COLS - 1) * GAP.x;
const PLAY_AREA_H = PLAY_ROWS_FIT * CARD.h + (PLAY_ROWS_FIT - 1) * GAP.y;
const HAND_Y = PLAY_Y + PLAY_AREA_H + GAP.y;

export const LIVE_BOARD_W = MARGIN.x * 2 + PLAY_AREA_W + GAP.x + CARD.w;
export const LIVE_BOARD_H = HAND_Y + CARD.h + MARGIN.y;

const DISCARD_ORIGIN: Vec = { x: MARGIN.x + PLAY_AREA_W + GAP.x, y: PLAY_Y };

/** Руки остальных игроков alias'ами, в порядке КРУГА мест от себя (свой sid исключён). */
export interface LiveHands {
  order: readonly string[];
  hands: Readonly<Record<string, readonly string[]>>;
}

interface Placed {
  id: string;
  origin: Vec;
  slot: Slot;
}

function playSlots(state: CrossadeState): Placed[] {
  const stackIds = [...state.play.map((_, i) => `play:${i}`), "play:new"];
  const layout = grid({ cell: CARD, cols: { min: PLAY_COLS }, gap: GAP.x });
  const { at } = layout.place(stackIds.map(() => CARD));
  return stackIds.map((id, i) => {
    const cards = state.play[i] ?? [];
    return {
      id,
      origin: { x: MARGIN.x + at[i]!.x, y: PLAY_Y + at[i]!.y },
      slot: group(id, pile({ dx: PLAY_STAGGER, dy: PLAY_STAGGER, cell: CARD }), cards.map((c) => leaf(c, c, CARD)), {
        drop: { accept: () => true },
      }),
    };
  });
}

function discardSlot(state: CrossadeState): Placed {
  return {
    id: "discard",
    origin: DISCARD_ORIGIN,
    slot: group("discard", pile({ dx: 0, dy: 0, cell: CARD }), state.discard.map((c) => leaf(c, c, CARD)), {
      drop: { accept: () => true },
    }),
  };
}

/** Пустой руке linear() намерил бы нулевой габарит — pile() с cell-резервом (см. multiplayer/tree.ts). */
function handSlot(state: CrossadeState): Placed {
  const cards = state.selfHand.map((c) => leaf(c, c, CARD));
  const layout = cards.length ? linear({ axis: "x", gap: GAP.x }) : pile({ dx: 0, dy: 0, cell: CARD });
  return {
    id: "hand",
    origin: { x: MARGIN.x, y: HAND_Y },
    slot: group("hand", layout, cards, { drop: { accept: () => true }, reorder: { enabled: true } }),
  };
}

/** Места ОСТАЛЬНЫХ игроков: ряд рубашек-alias'ов внахлёст, в порядке руки владельца. Дропзоной
 *  место не бывает — раздачи здесь нет; рубашка — лист как лист, домом и слотом занимается дерево. */
function seatSlots(live: LiveHands): Placed[] {
  const layout = linear({ axis: "x", gap: GAP.x });
  const { at } = layout.place(live.order.map(() => LIVE_SEAT));
  return live.order.map((sid, i) => {
    const aliases = live.hands[sid] ?? [];
    return {
      id: `seat:${sid}`,
      origin: { x: MARGIN.x + at[i]!.x, y: SEATS_Y + at[i]!.y + 22 },
      slot: group(
        `seat:${sid}`,
        pile({ dx: SEAT_CARD_DX, dy: 0, cell: LIVE_SEAT_CARD }),
        aliases.map((a) => leaf(a, a, LIVE_SEAT_CARD)),
      ),
    };
  });
}

/** Круг остальных от себя: seatOrder повёрнут так, чтобы после self шли остальные по кругу. */
export function othersInRing(seatOrder: readonly string[], self: string): string[] {
  const at = seatOrder.indexOf(self);
  if (at < 0) return [...seatOrder];
  return [...seatOrder.slice(at + 1), ...seatOrder.slice(0, at)];
}

/** Публичная ли точка доски: только из публичных зон жестам разрешено нести координаты — полоса
 *  мест у каждого зрителя своя, и точка в ней у другого зрителя значила бы ДРУГОЕ место. */
export function isSharedPoint(cp: Vec): boolean {
  return cp.y >= PLAY_Y - GAP.y / 2;
}

export function buildLiveTree(state: CrossadeState, live: LiveHands): MultiplayerTree {
  const placed: Placed[] = [...playSlots(state), discardSlot(state), handSlot(state), ...seatSlots(live)];

  const root = group(
    "live-root",
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
  const size = { w: Math.max(LIVE_BOARD_W, measured.w), h: Math.max(LIVE_BOARD_H, measured.h) };

  return {
    root,
    size,
    origins,
    homeOf: (cardId) => leafHomeOf(root, cardId),
    slotOf: (cardId) => slotIndex.get(cardId) ?? null,
    slotAt: (cp) => dropTarget(root, cp)?.group.id ?? null,
  };
}
