import { absolute, grid, linear, pile } from "../slot/layouts";
import { dropTarget, figures, homeOf as leafHomeOf, measure } from "../slot/slot";
import { group, leaf, type Group, type Size, type Slot, type Vec } from "../slot/types";
import { CARD, SEAT } from "../crossade/tree";
import type { CrossadeState } from "../crossade/state";

// ГЕОМЕТРИЯ ДЕБАГ-СТОЛА Multiplayer — дерево слотов по образцу crossade/tree.ts, но БЕЗ колоды,
// сброса и фаз: одна общая play-зона (все видят всё, кладёт и забирает любой), ряд своей руки,
// полоса мест игроков со счётом карт. Снимок — тот же CrossadeState (мастер кормит настоящий
// snapshotFrom, см. localTable.ts): deck/discard в нём просто пусты и слотов не получают.

const GAP = { x: 24, y: 30 };
const MARGIN = { x: 40, y: 30 };

const PLAY_STAGGER = 6;
const PLAY_COLS = 4;
const PLAY_ROWS_FIT = 2;

const SEATS_Y = MARGIN.y;
const PLAY_Y = SEATS_Y + SEAT.h + GAP.y;

const PLAY_AREA_W = PLAY_COLS * CARD.w + (PLAY_COLS - 1) * GAP.x;
const PLAY_AREA_H = PLAY_ROWS_FIT * CARD.h + (PLAY_ROWS_FIT - 1) * GAP.y;
const HAND_Y = PLAY_Y + PLAY_AREA_H + GAP.y;

/** Габарит доски в покое — от него камера считает вписывание (см. solitaire/tree.ts). */
export const BOARD_W = MARGIN.x * 2 + PLAY_AREA_W;
export const BOARD_H = HAND_Y + CARD.h + MARGIN.y;

interface Placed {
  id: string;
  origin: Vec;
  slot: Slot;
}

/** Кучки play-зоны + ВСЕГДА один пустой слот «новая кучка» в конце (правило crossade/tree.ts:
 *  пустая зона всё равно ловит дроп — сюда и кладут первую карту). */
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

/** Пустой руке linear() намерил бы нулевой габарит, и взять карту со стола стало бы некуда —
 *  поэтому пустая рука раскладывается pile() с cell-резервом (тот же приём, что у пустой кучки). */
function handSlot(state: CrossadeState): Placed {
  const cards = state.selfHand.map((c) => leaf(c, c, CARD));
  const layout = cards.length ? linear({ axis: "x", gap: GAP.x }) : pile({ dx: 0, dy: 0, cell: CARD });
  return {
    id: "hand",
    origin: { x: MARGIN.x, y: HAND_Y },
    slot: group("hand", layout, cards, { drop: { accept: () => true }, reorder: { enabled: true } }),
  };
}

/** Места игроков — только подпись со счётом (рисует сцена), чужие карты не раскладываются.
 *  Дропзоной место не бывает: раздачи на этом столе нет. Пустая группа с cell-резервом — как в
 *  crossade/tree.ts (лист дропзоной/якорем габарита стать не может). */
function seatSlots(state: CrossadeState): Placed[] {
  const layout = linear({ axis: "x", gap: GAP.x });
  const { at } = layout.place(state.seats.map(() => SEAT));
  return state.seats.map((seat, i) => ({
    id: `seat:${seat.sessionId}`,
    origin: { x: MARGIN.x + at[i]!.x, y: SEATS_Y + at[i]!.y },
    slot: group(`seat:${seat.sessionId}`, pile({ dx: 0, dy: 0, cell: SEAT }), []),
  }));
}

export interface MultiplayerTree {
  readonly root: Group;
  readonly size: Size;
  readonly origins: Readonly<Record<string, Vec>>;
  homeOf(cardId: string): Vec | null;
  slotOf(cardId: string): string | null;
  slotAt(cp: Vec): string | null;
}

/** Дерево под ТЕКУЩИЙ снимок — вид состояния, не второй источник правды (см. crossade/tree.ts). */
export function buildMultiplayerTree(state: CrossadeState): MultiplayerTree {
  const placed: Placed[] = [...playSlots(state), handSlot(state), ...seatSlots(state)];

  const root = group(
    "mp-root",
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
