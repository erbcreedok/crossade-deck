// СМАРТ-МОК борды — драйвер порта команд БЕЗ валидации правил (BOARDS-DESIGN §3): исполняет
// честно всё, что не рушит структуру, — правила игры живут в головах игроков, а когда придут
// настоящие, они встанут МЕЖДУ портом и мутацией, не трогая ни команд, ни борды.
//
// Чистый редьюсер: applyCommand(spec, state, cmd, rng) → state'. Rng инжектится (тесты —
// детерминированные), сцена передаёт Math.random.

import { at, move, place } from "../slotfield/slotField";
import { topId } from "../slotfield/container";
import { handKey, initialState, OFFBOARD_KEY, type BoardState } from "./state";
import { baseZoneId, slotKey, zoneOf, type BoardCommand, type BoardSpec, type SlotKey } from "./spec";

export type Rng = () => number;

function zoneSpec(spec: BoardSpec, zoneId: string) {
  return spec.zones.find((z) => z.id === baseZoneId(zoneId));
}

/** Оверрайд лица карты: face задан — ставим, отсутствует — снимаем (переехавшая карта слушается
 *  правил новой зоны). Поворот переезжает с картой. Пустая запись стирается. */
function withFace(fx: BoardState["fx"], el: string, face: boolean | undefined): BoardState["fx"] {
  const out = { ...fx };
  const entry = { ...(out[el] ?? {}) };
  if (face === undefined) delete entry.face;
  else entry.face = face;
  if (entry.face === undefined && entry.rot === undefined) delete out[el];
  else out[el] = entry;
  return out;
}

/** Визуалы после переезда: сторона карты, позиция свободной стопки, чистка позиций опустевших. */
function moveVisuals(state: BoardState, el: string, to: SlotKey, atPos?: { x: number; y: number }, face?: boolean): BoardState {
  const loose = { ...state.free.loose };
  if (atPos) loose[to] = atPos;
  for (const key of Object.keys(loose)) {
    if (key !== to && !at(state.field, key)?.members.length) delete loose[key]; // стопку унесли — позиция мертва
  }
  return { ...state, fx: withFace(state.fx, el, face), free: { ...state.free, loose } };
}

/** Дроп в занятый слот — политика зоны (slotfield: merge/swap/capture/reject) над SlotField. */
function resolveMove(spec: BoardSpec, state: BoardState, cmd: { el: string; from: SlotKey; to: SlotKey; at?: { x: number; y: number }; face?: boolean }): BoardState {
  const { el, from, to } = cmd;
  const zone = zoneSpec(spec, zoneOf(to));
  const target = at(state.field, to);
  const occupied = (target?.members.length ?? 0) > 0;
  const policy = zone?.policy;

  if (!occupied || !policy || policy.onOccupied === "merge") {
    if (policy?.maxSize !== undefined && (target?.members.length ?? 0) >= policy.maxSize) return state; // полный — отказ
    return moveVisuals({ ...state, field: move(state.field, from, to, [el]) }, el, to, cmd.at, cmd.face);
  }
  if (policy.onOccupied === "reject") return state;
  if (policy.onOccupied === "swap") {
    const other = topId(target!)!;
    let field = move(state.field, to, from, [other]);
    field = move(field, from, to, [el]);
    return moveVisuals({ ...state, field }, el, to, cmd.at, cmd.face);
  }
  // capture: вытесненный уезжает в displaceTo (или за борт), новичок занимает слот.
  const victim = topId(target!)!;
  const displaceTo = policy.displaceTo ? slotKey(policy.displaceTo, 0) : OFFBOARD_KEY;
  let field = move(state.field, to, displaceTo, [victim]);
  field = move(field, from, to, [el]);
  return moveVisuals({ ...state, field }, el, to, cmd.at, cmd.face);
}

/** Порядок раздачи «всю колоду поровну, дилеру ПОСЛЕДНИМ»: круг начинается со следующего за
 *  дилером; когда карт не хватает на полный круг, без карты остаются последние — то есть дилер
 *  (и, при разнице больше одной, его соседи справа). */
export function dealOrder(seatIds: readonly string[], dealer: string): string[] {
  const start = (seatIds.indexOf(dealer) + 1) % seatIds.length;
  return seatIds.map((_, i) => seatIds[(start + i) % seatIds.length]!);
}

function deal(spec: BoardSpec, state: BoardState, fromZone: string, each: number | "all-even-dealer-last"): BoardState {
  const fromKey = slotKey(fromZone, 0);
  const order = dealOrder(state.seats.map((s) => s.id), state.dealer);
  let field = state.field;
  const total = at(field, fromKey)?.members.length ?? 0;
  const rounds = each === "all-even-dealer-last" ? Math.ceil(total / order.length) : each;
  let fx = state.fx;
  for (let r = 0; r < rounds; r++) {
    for (const seat of order) {
      const deck = at(field, fromKey);
      const top = deck && topId(deck);
      if (top === undefined) break;
      field = move(field, fromKey, handKey(seat), [top]);
      fx = withFace(fx, top, undefined); // рука сама решает сторону — оверрайд снимается
    }
  }
  return { ...state, field, fx };
}

function shuffle(state: BoardState, zoneId: string, rng: Rng): BoardState {
  const key = slotKey(zoneId, 0);
  const members = [...(at(state.field, key)?.members ?? [])];
  for (let i = members.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [members[i], members[j]] = [members[j]!, members[i]!];
  }
  return { ...state, field: place(state.field, key, { members }) };
}

/** Перестановка контейнера: тот же состав в новом порядке, чужой состав — отказ без следа. */
function reorderContainer(state: BoardState, key: SlotKey, order: readonly string[]): BoardState {
  const current = at(state.field, key)?.members ?? [];
  const same = current.length === order.length && [...current].sort().join(" ") === [...order].sort().join(" ");
  if (!same) return state;
  return { ...state, field: place(state.field, key, { members: [...order] }) };
}

export function applyCommand(spec: BoardSpec, state: BoardState, cmd: BoardCommand, rng: Rng): BoardState {
  switch (cmd.t) {
    case "move":
      return resolveMove(spec, state, cmd);
    case "placeFree": {
      if (!at(state.field, cmd.key)?.members.length) return state; // двигать нечего
      return { ...state, free: { ...state.free, loose: { ...state.free.loose, [cmd.key]: cmd.at } } };
    }
    case "offsetFree":
      return { ...state, free: { ...state.free, offset: { ...state.free.offset, [cmd.zone]: cmd.offset } } };
    case "cardFx": {
      const fx = { ...state.fx };
      const entry = { rot: cmd.fx.rot, face: cmd.fx.face };
      if (entry.rot === undefined && entry.face === undefined) delete fx[cmd.el];
      else fx[cmd.el] = entry;
      return { ...state, fx };
    }
    case "deal":
      return deal(spec, state, cmd.from, cmd.each);
    case "shuffle":
      return shuffle(state, cmd.zone, rng);
    case "turn": {
      const n = state.seats.length;
      return { ...state, turn: { ...state.turn, at: (state.turn.at + state.turn.dir + n) % n } };
    }
    case "reverse":
      return { ...state, turn: { ...state.turn, dir: state.turn.dir === 1 ? -1 : 1 } };
    case "reset": {
      const fresh = initialState(spec, state.seats.length);
      const withDeal = spec.mock?.deal ? deal(spec, { ...fresh, seats: state.seats }, spec.mock.deal.from, spec.mock.deal.each) : { ...fresh, seats: state.seats };
      return withDeal;
    }
    case "roll": {
      const n = spec.mock?.dice ?? 0;
      return { ...state, dice: Array.from({ length: n }, () => 1 + Math.floor(rng() * 6)) };
    }
    case "reorderHand":
      return reorderContainer(state, handKey(cmd.seat), cmd.order);
    case "reorderSlot":
      return reorderContainer(state, cmd.key, cmd.order);
    case "sit": {
      const seats = state.seats.map((s) => (s.id === cmd.seat && s.occupant === null ? { ...s, occupant: cmd.who } : s));
      return { ...state, seats };
    }
    case "stand": {
      const seats = state.seats.map((s) => (s.occupant === cmd.who ? { ...s, occupant: null } : s));
      return { ...state, seats };
    }
  }
}

/** Стартовое состояние борды «как её открыли»: setup + мок-раздача. */
export function bootState(spec: BoardSpec, seatsWanted?: number, occupants?: readonly (string | null)[]): BoardState {
  const s = initialState(spec, seatsWanted, occupants);
  return spec.mock?.deal ? deal(spec, s, spec.mock.deal.from, spec.mock.deal.each) : s;
}
