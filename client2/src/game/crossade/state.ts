// Снимок стола Crossade — ЧИСТЫЙ (без colyseus, без Pixi, без React). Раз в кадр сети превращает
// «сырое» состояние комнаты (плоский JS-объект той же формы, что серверная схема — см. RawState) в
// CrossadeState, с которого дерево слотов (tree.ts) и сцена читают геометрию и видимость.
//
// Два защитных правила живут здесь же, потому что это ЧАСТЬ смысла снимка, а не сети:
//   1. stale-check по deckRev — устаревшее эхо не откатывает картинку назад (last-write-wins).
//   2. удержание порядка своей руки — сортировка/перетаскивание применяются локально сразу, а
//      подтверждение с сервера приходит позже; пока состав руки тот же, свой порядок не сбрасываем.
// Ориентир — client/src/room/useRoomState.ts (макет-референс): правило то же, код свой.

/** Один игрок в сыром состоянии комнаты. players — Map(sessionId → игрок) на схеме, здесь Record. */
export interface RawPlayer {
  /** accountId (см. CardRoom.ts: `player.id = accountId`) — НЕ sessionId. */
  id: string;
  name: string;
  isDealer: boolean;
  isReady: boolean;
  isBot: boolean;
  connected: boolean;
  handOpen: boolean;
  /** Карты в руке. Сервер шлёт их ВСЕМ независимо от handOpen — видимость решает клиент. */
  hand: readonly string[];
}

export interface RawPlayStack {
  cards: readonly string[];
}

/** Форма серверной GameState, но как обычный JS-объект (ArraySchema/MapSchema уже развёрнуты). */
export interface CrossadeRaw {
  phase: "lobby" | "playing" | "finished";
  freeMode: boolean;
  deckFanned: boolean;
  deckRev: number;
  inviteCode: string;
  deck: readonly string[];
  discard: readonly string[];
  play: readonly RawPlayStack[];
  /** Круг мест по часовой, дилер — голова круга (см. server/src/seatRing.ts). */
  seatOrder: readonly string[];
  players: Readonly<Record<string, RawPlayer>>;
}

/** Одно место за столом — то, что ВИДНО этому зрителю, а не вся правда сервера. */
export interface CrossadeSeat {
  sessionId: string;
  accountId: string;
  name: string;
  isDealer: boolean;
  isReady: boolean;
  isBot: boolean;
  connected: boolean;
  handOpen: boolean;
  handCount: number;
  /** Состав руки, если он виден: своя — всегда, чужая — только когда handOpen. Иначе null. */
  hand: string[] | null;
}

export interface CrossadeState {
  phase: "lobby" | "playing" | "finished";
  freeMode: boolean;
  deckFanned: boolean;
  deckRev: number;
  inviteCode: string;
  deck: string[];
  discard: string[];
  play: string[][];
  /** В порядке seatOrder, начиная с дилера. */
  seats: CrossadeSeat[];
  selfSessionId: string;
  /** Своя рука — с учётом удержания локального порядка (applyHandOrder). */
  selfHand: string[];
}

/**
 * Одна ли это стопка, только в другом порядке (перестановка). Своя копия правила
 * client/src/game/deckOrder.ts#isPermutationOf — форма та же, код свой.
 */
export function isPermutationOf(next: readonly string[], cur: readonly string[]): boolean {
  if (next.length !== cur.length) return false;
  return [...next].sort().join("|") === [...cur].sort().join("|");
}

/**
 * Удержание порядка своей руки. localOrder — то, что уже показано (своя сортировка/перетаскивание,
 * применённые оптимистично); serverHand — то, что подтвердил сервер.
 *
 *  - localOrder нет (первый снимок) → серверный порядок как есть.
 *  - состав совпадает (перестановка того же набора) → держим localOrder целиком: сервер просто
 *    подтвердил то же самое, откатывать нечего.
 *  - состав изменился (добор карты, сброс/взятие) → база серверная, но карты, которые были и в
 *    localOrder, и в serverHand, сохраняют ВЗАИМНЫЙ порядок из localOrder; карты, которых в
 *    localOrder не было (новый добор), остаются на своём серверном месте.
 */
export function applyHandOrder(serverHand: readonly string[], localOrder: readonly string[] | null): string[] {
  if (!localOrder) return [...serverHand];
  if (isPermutationOf(localOrder, serverHand)) return [...localOrder];

  const known = new Set(localOrder);
  // Карты, общие для обоих наборов, в ИХ взаимном порядке из localOrder (фильтруем, не сортируем).
  const queue = localOrder.filter((card) => known.has(card) && serverHand.includes(card));
  let qi = 0;
  return serverHand.map((card) => (known.has(card) ? queue[qi++]! : card));
}

/** Круг мест, но только из тех, кто реально в players; выпавшие из круга — в хвост (см. seatRing.ts). */
function orderedSessionIds(raw: CrossadeRaw): string[] {
  const known = Object.keys(raw.players);
  const ordered = raw.seatOrder.filter((id) => known.includes(id));
  for (const id of known) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}

function buildSeat(sessionId: string, p: RawPlayer, selfSessionId: string): CrossadeSeat {
  const visible = sessionId === selfSessionId || p.handOpen;
  return {
    sessionId,
    accountId: p.id,
    name: p.name,
    isDealer: p.isDealer,
    isReady: p.isReady,
    isBot: p.isBot,
    connected: p.connected,
    handOpen: p.handOpen,
    handCount: p.hand.length,
    hand: visible ? [...p.hand] : null,
  };
}

/**
 * Собрать снимок стола из сырого состояния комнаты. prev — предыдущий снимок этого же зрителя
 * (для stale-check и удержания порядка руки); при первом вызове (после подключения) не передаётся.
 */
export function snapshotFrom(raw: CrossadeRaw, selfSessionId: string, prev?: CrossadeState): CrossadeState {
  // 1. Stale-check: устаревшее эхо колоды не откатывает картинку — снимок остаётся прежним целиком.
  if (prev && raw.deckRev < prev.deckRev) return prev;

  const seatIds = orderedSessionIds(raw);
  const seats = seatIds.map((id) => buildSeat(id, raw.players[id]!, selfSessionId));

  const rawSelfHand = raw.players[selfSessionId]?.hand ?? [];
  const selfHand = applyHandOrder(rawSelfHand, prev?.selfHand ?? null);

  return {
    phase: raw.phase,
    freeMode: raw.freeMode,
    deckFanned: raw.deckFanned,
    deckRev: raw.deckRev,
    inviteCode: raw.inviteCode,
    deck: [...raw.deck],
    discard: [...raw.discard],
    play: raw.play.map((stack) => [...stack.cards]),
    seats,
    selfSessionId,
    selfHand,
  };
}
